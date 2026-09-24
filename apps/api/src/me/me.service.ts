import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, TeleSessionStatus } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type { UpdateStaffProfileDto } from './dto/staff-profile.dto.js';
import { BillingService } from '../billing/billing.service.js';
import { FilesService } from '../files/files.service.js';
import { ReportsService } from '../labs/reports.service.js';
import { isReleased, type LabResultStatus } from '../labs/verification.js';

/**
 * Self-scoped service for the patient portal. Every method derives the patient
 * id from `user.patientId` (JWT `pid`), never from a path/body param. If the
 * caller's JWT lacks `pid`, every method 403s — staff JWTs cannot accidentally
 * hit /api/me/*.
 *
 * Cross-tenant safety still leans on PrismaService.withTenant + RLS; the
 * patient-id check below is an additional layer for the portal surface.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly config: ConfigService,
    private readonly files: FilesService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * The patient's own laboratory reports.
   *
   * Scoped to their `patientId` from the JWT, never a param — the same rule
   * every other method here follows.
   */
  labReports(user: AuthenticatedUser) {
    return this.reports.listForPatient(this.requirePatientId(user), user);
  }

  /**
   * One of their reports, as a PDF.
   *
   * The patient id is passed down so the lookup is scoped by ownership as
   * well as by RLS. Without it a portal account could fetch another
   * patient's report by id — the same shape as the original portal BOLA.
   */
  labReportPdf(reportId: string, user: AuthenticatedUser) {
    return this.reports.renderPdf(reportId, user, {
      patientId: this.requirePatientId(user),
    });
  }

  private requirePatientId(user: AuthenticatedUser): string {
    if (!user.patientId) {
      throw new ForbiddenException('portal endpoint — caller is not a patient');
    }
    return user.patientId;
  }

  // ── Staff profile ──────────────────────────────────────────────
  // The one part of /me that is for staff, not the portal: a clinician's
  // own account row (name + PRC licence). Self-scoped by JWT `sub`; the
  // acting-as delegation never applies here (a delegate must not edit
  // the delegator's licence), hence the explicit onBehalfOfUserId check.

  private static readonly STAFF_PROFILE_SELECT = {
    id: true,
    email: true,
    name: true,
    prcLicenseNumber: true,
    prcLicenseExpiry: true,
    prcSpecialty: true,
  } as const;

  private requireStaff(user: AuthenticatedUser): string {
    if (user.role === 'PATIENT' || user.patientId) {
      throw new ForbiddenException('staff endpoint — caller is a patient');
    }
    if (user.onBehalfOfUserId) {
      throw new ForbiddenException(
        'profile cannot be read or edited while acting on behalf of someone',
      );
    }
    return user.userId;
  }

  async staffProfile(user: AuthenticatedUser) {
    const userId = this.requireStaff(user);
    // users has no tenant-scoped UPDATE policy (the auth service edits it
    // under the platform context too); the row is pinned to the JWT's own
    // id, so the platform context adds no reach.
    const row = await this.prisma.withPlatformContext((tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: MeService.STAFF_PROFILE_SELECT,
      }),
    );
    if (!row) throw new NotFoundException('user not found');
    return { ...row, role: user.role, tenantId: user.tenantId };
  }

  async updateStaffProfile(
    dto: UpdateStaffProfileDto,
    user: AuthenticatedUser,
  ) {
    const userId = this.requireStaff(user);
    const data: {
      name?: string;
      prcLicenseNumber?: string | null;
      prcLicenseExpiry?: Date | null;
      prcSpecialty?: string | null;
    } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.prcLicenseNumber !== undefined) {
      data.prcLicenseNumber = dto.prcLicenseNumber;
    }
    if (dto.prcLicenseExpiry !== undefined) {
      data.prcLicenseExpiry =
        dto.prcLicenseExpiry === null ? null : new Date(dto.prcLicenseExpiry);
    }
    if (dto.prcSpecialty !== undefined) {
      data.prcSpecialty = dto.prcSpecialty?.trim() || null;
    }
    const row = await this.prisma.withPlatformContext((tx) =>
      tx.user.update({
        where: { id: userId },
        data,
        select: MeService.STAFF_PROFILE_SELECT,
      }),
    );
    return { ...row, role: user.role, tenantId: user.tenantId };
  }

  async profile(user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      return tx.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: {
          id: true,
          mrn: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          sex: true,
          email: true,
          phone: true,
        },
      });
    });
  }

  async appointments(user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      return tx.appointment.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { startsAt: 'desc' },
        take: 50,
      });
    });
  }

  async invoices(user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      return tx.invoice.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { issuedAt: 'desc' },
        include: { items: true, payments: true },
        take: 50,
      });
    });
  }

  async records(user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const [
        allergies,
        medications,
        conditions,
        vitals,
        prescriptions,
        labOrders,
      ] = await Promise.all([
        tx.allergy.findMany({ where: { patientId } }),
        tx.medication.findMany({
          where: { patientId },
          orderBy: { startedOn: 'desc' },
        }),
        tx.condition.findMany({
          where: { patientId },
          orderBy: { diagnosedOn: 'desc' },
        }),
        tx.vital.findMany({
          where: { patientId },
          orderBy: { measuredAt: 'desc' },
          take: 10,
        }),
        tx.prescription.findMany({
          where: { patientId, deletedAt: null },
          orderBy: { issuedAt: 'desc' },
          include: { items: true },
          take: 20,
        }),
        tx.labOrder.findMany({
          where: { patientId, deletedAt: null },
          include: { items: { orderBy: { createdAt: 'asc' } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);
      return {
        allergies,
        medications,
        conditions,
        vitals,
        prescriptions,
        labOrders: labOrders.map((o) => ({
          ...o,
          items: o.items.map(redactUnreleasedResult),
        })),
      };
    });
  }

  /**
   * Self-scoped PDF: verify the invoice belongs to this portal user's patient,
   * then delegate rendering to BillingService. The ownership check is the
   * critical bit — a portal user must not be able to render arbitrary invoice
   * PDFs from their tenant.
   */
  async invoicePdf(
    invoiceId: string,
    user: AuthenticatedUser,
  ): Promise<Buffer> {
    const patientId = this.requirePatientId(user);
    const owns = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      (tx) =>
        tx.invoice.findFirst({
          where: { id: invoiceId, patientId, deletedAt: null },
          select: { id: true },
        }),
    );
    if (!owns) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    return this.billing.renderInvoicePdf(invoiceId, user);
  }

  /**
   * Returns the patient's most recent live tele session (PENDING or ACTIVE)
   * with its join URL, or `null` if none. Mobile uses this to surface a
   * "Join your video visit" card on the portal home and to open the session
   * in an in-app browser.
   */
  async teleActive(user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    const { session, provider } = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      async (tx) => {
        const session = await tx.teleSession.findFirst({
          where: {
            patientId,
            status: {
              in: [TeleSessionStatus.PENDING, TeleSessionStatus.ACTIVE],
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!session) return { session: null, provider: null };
        // No relation defined on TeleSession.providerId — fetch the user
        // separately. Inside the same RLS context so users_visible_in_tenant
        // matches.
        const provider = await tx.user.findFirst({
          where: { id: session.providerId },
          select: { name: true },
        });
        return { session, provider };
      },
    );
    if (!session) return null;
    const base = this.config.get<string>('PORTAL_BASE_URL') ?? '';
    return {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      providerName: provider?.name ?? null,
      joinUrl: `${base}/portal/tele/${session.joinToken}`,
    };
  }
  /**
   * Download one of the caller's OWN documents.
   *
   * requirePatientId throws for a staff JWT, and FilesService then refuses
   * any file whose patientId does not equal the caller's — including every
   * file with a null owner, which is how non-clinical files (clinic logo,
   * a clinician's signature image) stay staff-only without a second rule.
   *
   * The id comes from the path, but it is only ever an id: ownership is
   * decided against the JWT `pid` claim, so probing ids reveals nothing.
   */
  async downloadFile(fileId: string, user: AuthenticatedUser) {
    this.requirePatientId(user);
    return this.files.download(fileId, user);
  }
}

/**
 * Hide the value of a result nobody has released.
 *
 * The verification chain introduced PRELIMINARY — "a value exists but nobody
 * has stood behind it" — and this endpoint was returning it to the patient
 * unfiltered. The effect was backwards: a clinic that turned verification ON,
 * which is the safety-conscious choice, sent technologist-entered values
 * straight to the patient, while one that left it off was unaffected.
 *
 * The row is kept and the value removed, rather than the row dropped: a
 * patient should be able to see that a test is pending. `resultStatus` comes
 * through so the portal can say so.
 *
 * This is a presentation boundary, not a security boundary — staff endpoints
 * still return the unreleased value, because that is the bench worklist.
 */
function redactUnreleasedResult<
  T extends {
    resultStatus: string;
    resultValue: string | null;
    resultUnit: string | null;
    abnormalFlag: unknown;
    comment: string | null;
    reportedAt: Date | null;
  },
>(item: T): T {
  if (isReleased(item.resultStatus as LabResultStatus)) return item;
  return {
    ...item,
    resultValue: null,
    resultUnit: null,
    abnormalFlag: null,
    comment: null,
    reportedAt: null,
  };
}
