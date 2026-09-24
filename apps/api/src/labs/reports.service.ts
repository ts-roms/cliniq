import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LabReportStatus,
  PrismaService,
  type PrismaClient,
  type Role,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
// The report series shares DocumentSequence with order and accession
// numbers, so all three are allocated the same atomic way.
import { nextSequenceValue, orderPeriod } from './accession.js';
import { licenceStatus } from './capability.js';
import {
  canIssueReport,
  formatReportNumber,
  hashReportContent,
  reportIsCurrent,
  type ReportableResult,
} from './reporting.js';
import {
  renderLabReportPdf,
  type LabReportPdfData,
} from './pdf/render-lab-report-pdf.js';

/**
 * Signed laboratory reports.
 *
 * The release path: verified results had nowhere to go. A laboratory could
 * release a result and still issue nothing a patient or referring doctor
 * could hold, while invoices and prescriptions both had a signed artifact.
 *
 * Two rules do most of the work here:
 *
 *   1. A report can only be issued when every result on the order is
 *      released. Signing a report containing a PRELIMINARY value would put a
 *      PRC licence against something nobody has stood behind.
 *   2. A report is never edited. If a result changes afterwards the report is
 *      superseded by a new version, because the original was genuinely
 *      issued and someone may hold a copy.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issue a report for an order, signed by the caller.
   *
   * Issuing again after a correction supersedes the previous version rather
   * than replacing it. Issuing again when nothing has changed is refused —
   * a second identical report with a different number is just confusing, and
   * the caller almost certainly meant to sign the existing one.
   */
  async issue(orderId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const order = await tx.labOrder.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { items: true },
      });
      if (!order) throw new NotFoundException(`Lab order ${orderId} not found`);

      const results = toReportable(order.items);
      const verdict = canIssueReport(results);
      if (!verdict.ok) throw new BadRequestException(verdict.reason);

      const contentHash = hashReportContent(results);

      const previous = await tx.labReport.findFirst({
        where: { orderId },
        orderBy: { version: 'desc' },
      });
      if (previous && previous.contentHash === contentHash) {
        throw new BadRequestException(
          `report ${previous.number} already covers these exact results; sign it instead of issuing another`,
        );
      }

      const now = new Date();
      const value = await nextSequenceValue(
        tx,
        user.tenantId,
        'LAB_REPORT',
        orderPeriod(now),
      );

      const report = await tx.labReport.create({
        data: {
          tenantId: user.tenantId,
          orderId,
          patientId: order.patientId,
          number: formatReportNumber(now, value),
          version: (previous?.version ?? 0) + 1,
          status: LabReportStatus.ISSUED,
          contentHash,
          issuedById: user.userId,
          supersedesId: previous?.id ?? null,
        },
      });

      if (previous) {
        await tx.labReport.update({
          where: { id: previous.id },
          data: { status: LabReportStatus.SUPERSEDED },
        });
        this.logger.warn(
          `report ${report.number} supersedes ${previous.number} — results changed after issue`,
        );
      }

      await this.addSignature(tx, report.id, contentHash, user);

      this.logger.log(
        `report ${report.number} issued for order ${order.number} by ${user.userId}`,
      );
      return this.load(tx, report.id);
    });
  }

  /**
   * Countersign an already-issued report.
   *
   * A pathologist endorsing what a technologist issued. Refused once the
   * report is stale: signing a document that no longer matches the results
   * is exactly the outcome the content hash exists to prevent.
   */
  async sign(reportId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const report = await tx.labReport.findFirst({
        where: { id: reportId },
        include: { signatures: true },
      });
      if (!report) throw new NotFoundException(`Report ${reportId} not found`);

      if (report.status === LabReportStatus.SUPERSEDED) {
        throw new BadRequestException(
          'this report has been superseded; sign the current version instead',
        );
      }
      if (await this.isStale(tx, report.orderId, report.contentHash)) {
        throw new BadRequestException(
          'the results have changed since this report was issued; re-issue it before signing',
        );
      }
      if (report.signatures.some((sig) => sig.signerId === user.userId)) {
        throw new BadRequestException('you have already signed this report');
      }

      await this.addSignature(tx, report.id, report.contentHash, user);
      this.logger.log(
        `report ${report.number} countersigned by ${user.userId}`,
      );
      return this.load(tx, report.id);
    });
  }

  /** Reports for an order, newest version first. */
  list(orderId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labReport.findMany({
        where: { orderId },
        include: { signatures: { orderBy: { signedAt: 'asc' } } },
        orderBy: { version: 'desc' },
      }),
    );
  }

  /**
   * One report, with `isCurrent` computed rather than stored.
   *
   * Stored staleness would need updating from every path that can change a
   * result. Computing it means a report cannot silently drift into looking
   * valid.
   */
  async detail(reportId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const report = await this.load(tx, reportId);
      if (!report) throw new NotFoundException(`Report ${reportId} not found`);
      return report;
    });
  }

  /**
   * Render a report as a PDF.
   *
   * `patientId` scopes the lookup when the portal calls this, so a patient
   * cannot fetch another patient's report by id. Staff pass nothing and RLS
   * is the only scope, as everywhere else on the staff surface.
   */
  async renderPdf(
    reportId: string,
    user: AuthenticatedUser,
    opts: { patientId?: string } = {},
  ): Promise<Buffer> {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const report = await tx.labReport.findFirst({
        where: {
          id: reportId,
          ...(opts.patientId ? { patientId: opts.patientId } : {}),
        },
        include: {
          signatures: { orderBy: { signedAt: 'asc' } },
          supersededBy: { select: { number: true } },
          order: {
            select: {
              number: true,
              items: {
                select: {
                  testCode: true,
                  testName: true,
                  resultValue: true,
                  resultUnit: true,
                  referenceLow: true,
                  referenceHigh: true,
                  abnormalFlag: true,
                  resultStatus: true,
                },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
      });
      if (!report) throw new NotFoundException(`Report ${reportId} not found`);

      const patient = await tx.patient.findFirst({
        where: { id: report.patientId },
        select: {
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          sex: true,
          mrn: true,
        },
      });
      if (!patient) {
        throw new NotFoundException(`Patient for report ${reportId} not found`);
      }

      const tenant = await tx.tenant.findFirst({
        where: { id: user.tenantId },
        select: { name: true, settings: true },
      });
      const lab = await tx.laboratory.findFirst();
      const location = await tx.location.findFirst({
        where: { isPrimary: true, deletedAt: null, active: true },
        select: {
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          province: true,
          phone: true,
        },
      });

      // Recomputed at render time, not read from a column: a PDF generated
      // after a correction must carry the warning even though the row was
      // written before it.
      const isCurrent = reportIsCurrent(
        report.contentHash,
        toReportable(report.order.items),
      );

      return renderLabReportPdf({
        report: {
          number: report.number,
          version: report.version,
          status: report.status,
          issuedAt: report.issuedAt,
          isCurrent,
          supersededByNumber: report.supersededBy?.number ?? null,
          orderNumber: report.order.number,
          results: report.order.items.map((i) => ({
            testCode: i.testCode,
            testName: i.testName,
            resultValue: i.resultValue,
            resultUnit: i.resultUnit,
            referenceLow: i.referenceLow,
            referenceHigh: i.referenceHigh,
            abnormalFlag: i.abnormalFlag,
            resultStatus: i.resultStatus,
          })),
          signatures: report.signatures.map((s) => ({
            signerName: s.signerName,
            signerRole: s.signerRole,
            signerLicense: s.signerLicense,
            signedAt: s.signedAt,
          })),
        },
        tenant: {
          name: tenant?.name ?? 'Clinic',
          settings: tenant?.settings as LabReportPdfData['tenant']['settings'],
        },
        laboratory: lab
          ? {
              name: lab.name,
              dohLtoNumber: lab.dohLtoNumber,
              category: lab.category,
              classification: lab.classification,
              headName: lab.headName,
              headLicenseNumber: lab.headLicenseNumber,
              licenceExpired: licenceStatus(lab, new Date()).expired,
            }
          : null,
        location,
        patient,
      });
    });
  }

  /**
   * The reports a patient may see: issued, still current, for their own
   * record only.
   *
   * Superseded and stale reports are withheld from the portal rather than
   * shown with a warning. Staff need the history; a patient reading their own
   * results is better served by the one document that is true. The superseded
   * banner on the PDF exists for copies already in circulation.
   */
  listForPatient(patientId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const reports = await tx.labReport.findMany({
        where: { patientId, status: LabReportStatus.ISSUED },
        include: {
          signatures: {
            select: {
              signerName: true,
              signerRole: true,
              signerLicense: true,
              signedAt: true,
            },
            orderBy: { signedAt: 'asc' },
          },
          order: { select: { number: true, items: true } },
        },
        orderBy: { issuedAt: 'desc' },
        take: 50,
      });
      return reports
        .filter((r) =>
          reportIsCurrent(r.contentHash, toReportable(r.order.items)),
        )
        .map((r) => ({
          id: r.id,
          number: r.number,
          version: r.version,
          issuedAt: r.issuedAt,
          orderNumber: r.order.number,
          signatures: r.signatures,
        }));
    });
  }

  // ── helpers ──────────────────────────────────────

  private async load(tx: PrismaClient, reportId: string) {
    const report = await tx.labReport.findFirst({
      where: { id: reportId },
      include: {
        signatures: { orderBy: { signedAt: 'asc' } },
        order: {
          select: {
            number: true,
            patientId: true,
            items: {
              select: {
                testCode: true,
                testName: true,
                resultValue: true,
                resultUnit: true,
                referenceLow: true,
                referenceHigh: true,
                abnormalFlag: true,
                resultStatus: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
    if (!report) return null;
    return {
      ...report,
      isCurrent: reportIsCurrent(
        report.contentHash,
        toReportable(report.order.items),
      ),
    };
  }

  private async isStale(
    tx: PrismaClient,
    orderId: string,
    contentHash: string,
  ): Promise<boolean> {
    const items = await tx.labOrderItem.findMany({ where: { orderId } });
    return !reportIsCurrent(contentHash, toReportable(items));
  }

  /**
   * Snapshot the signer's name and PRC licence onto the signature.
   *
   * Same reason `Prescription.providerLicense` does it: a later edit to the
   * user's licence details must not retroactively change what appears on a
   * document someone already signed.
   */
  private async addSignature(
    tx: PrismaClient,
    reportId: string,
    contentHash: string,
    user: AuthenticatedUser,
  ) {
    const signer = await tx.user.findFirst({
      where: { id: user.userId },
      select: { name: true, prcLicenseNumber: true },
    });
    return tx.labReportSignature.create({
      data: {
        tenantId: user.tenantId,
        reportId,
        signerId: user.userId,
        signerRole: user.role as Role,
        signerName: signer?.name ?? 'Unknown',
        signerLicense: signer?.prcLicenseNumber ?? null,
        contentHash,
      },
    });
  }
}

/** Order items as the report sees them. */
function toReportable(
  items: ReadonlyArray<{
    testCode: string | null;
    testName: string;
    resultValue: string | null;
    resultUnit: string | null;
    abnormalFlag: string | null;
    resultStatus: string;
  }>,
): ReportableResult[] {
  return items.map((i) => ({
    testCode: i.testCode,
    testName: i.testName,
    resultValue: i.resultValue,
    resultUnit: i.resultUnit,
    abnormalFlag: i.abnormalFlag,
    resultStatus: i.resultStatus,
  }));
}
