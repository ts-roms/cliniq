import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import {
  LabPdfRenderingService,
  applyTemplate,
} from '../_shared/pdf-rendering.service.js';
import type {
  CaptureSignatureDto,
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/compliance.dto.js';

/**
 * Compliance templates + e-signature capture. Conformity templates are
 * lab-only; consent templates are lab-owned but readable by linked clinics
 * (so the clinic can render the body when capturing a patient's signature).
 */
@Injectable()
export class LabComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: LabPdfRenderingService,
  ) {}

  // ── Conformity templates (lab-only) ──────────────────────

  async listConformity(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labConformityDocTemplate.findMany({
        where: { tenantId: user.tenantId, deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
    );
  }

  async createConformity(dto: CreateTemplateDto, user: AuthenticatedUser) {
    await this.requireLab(user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labConformityDocTemplate.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name,
          body: dto.body,
          productId: dto.productId ?? null,
          isDefault: dto.isDefault ?? false,
        },
      }),
    );
  }

  async updateConformity(id: string, dto: UpdateTemplateDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const t = await tx.labConformityDocTemplate.findFirst({
        where: { id, deletedAt: null },
      });
      if (!t) throw new NotFoundException('template not found');
      return tx.labConformityDocTemplate.update({
        where: { id },
        data: {
          name: dto.name ?? t.name,
          body: dto.body ?? t.body,
          productId:
            dto.productId === undefined ? t.productId : dto.productId,
          isDefault: dto.isDefault ?? t.isDefault,
        },
      });
    });
  }

  async removeConformity(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const t = await tx.labConformityDocTemplate.findFirst({
        where: { id, deletedAt: null },
      });
      if (!t) throw new NotFoundException('template not found');
      await tx.labConformityDocTemplate.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  // ── Consent templates (lab-owned, clinic-readable when linked) ──

  async listConsent(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labConsentTemplate.findMany({
        where: { deletedAt: null }, // RLS filters by tenant + linked-clinic
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
    );
  }

  async createConsent(dto: CreateTemplateDto, user: AuthenticatedUser) {
    await this.requireLab(user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labConsentTemplate.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name,
          body: dto.body,
          productId: dto.productId ?? null,
          isDefault: dto.isDefault ?? false,
        },
      }),
    );
  }

  async updateConsent(id: string, dto: UpdateTemplateDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const t = await tx.labConsentTemplate.findFirst({
        where: { id, deletedAt: null },
      });
      if (!t) throw new NotFoundException('template not found');
      return tx.labConsentTemplate.update({
        where: { id },
        data: {
          name: dto.name ?? t.name,
          body: dto.body ?? t.body,
          productId:
            dto.productId === undefined ? t.productId : dto.productId,
          isDefault: dto.isDefault ?? t.isDefault,
        },
      });
    });
  }

  async removeConsent(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const t = await tx.labConsentTemplate.findFirst({
        where: { id, deletedAt: null },
      });
      if (!t) throw new NotFoundException('template not found');
      await tx.labConsentTemplate.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  // ── Signatures (per-case) ────────────────────────────────

  async listSignaturesForCase(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return tx.labConsentSignature.findMany({
        where: { caseId },
        orderBy: { signedAt: 'desc' },
        include: { template: { select: { id: true, name: true } } },
      });
    });
  }

  /**
   * Capture a signature against a template. The signature image must already
   * be uploaded to S3 (clinic-side flow uses the existing files presign);
   * we just record the key. We snapshot the body so the agreed-to text is
   * frozen even if the template later changes.
   */
  async captureSignature(
    caseId: string,
    dto: CaptureSignatureDto,
    user: AuthenticatedUser,
    requestMeta: { ip?: string; userAgent?: string },
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');

      const template = await tx.labConsentTemplate.findFirst({
        where: { id: dto.templateId, deletedAt: null },
      });
      if (!template) throw new NotFoundException('template not found');

      return tx.labConsentSignature.create({
        data: {
          caseId,
          templateId: template.id,
          signedByName: dto.signedByName,
          signedByRole: dto.signedByRole ?? null,
          signatureFileKey: dto.signatureFileKey,
          ipAddress: requestMeta.ip ?? null,
          userAgent: requestMeta.userAgent ?? null,
          bodySnapshot: template.body,
        },
      });
    });
  }

  // ── Conformity PDF render ────────────────────────────────

  /**
   * Render a conformity declaration PDF for a case using the given template
   * (or the default template for the case's product if `templateId` is null).
   * Lab-only — clinics can later read the artifact via the case detail flow,
   * but generation is the lab's responsibility.
   *
   * Pulls together case + product + lab + clinic + lot numbers used on the
   * case, applies `{{placeholder}}` substitutions, and emits the PDF.
   */
  async renderConformityPdf(
    caseId: string,
    templateId: string | null,
    user: AuthenticatedUser,
  ) {
    await this.requireLab(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, labTenantId: user.tenantId, deletedAt: null },
        include: {
          product: { select: { id: true, name: true } },
          lab: { select: { id: true, name: true, slug: true, kind: true } },
          clinic: { select: { id: true, name: true, slug: true } },
          materialUsages: { include: { lot: { include: { material: true } } } },
        },
      });
      if (!labCase) throw new NotFoundException('case not found');

      const template = templateId
        ? await tx.labConformityDocTemplate.findFirst({
            where: { id: templateId, tenantId: user.tenantId, deletedAt: null },
          })
        : (await tx.labConformityDocTemplate.findFirst({
            where: {
              tenantId: user.tenantId,
              deletedAt: null,
              OR: [{ productId: labCase.product.id }, { productId: null }],
            },
            orderBy: [{ productId: 'desc' }, { isDefault: 'desc' }],
          }));
      if (!template) {
        throw new BadRequestException(
          'no conformity template found — create one (or set isDefault=true) first',
        );
      }

      const lots = labCase.materialUsages
        .map((u) => `${u.lot.material.name} · lot ${u.lot.lotNumber}`)
        .join('\n') || '—';
      const ref =
        labCase.refNumber !== null
          ? `#${labCase.refNumber}`
          : labCase.id.slice(-6);
      const vars: Record<string, string> = {
        caseRef: ref,
        patient: labCase.patientLabel ?? '—',
        doctor: labCase.doctorLabel ?? '—',
        labName: labCase.lab.name,
        clinicName: labCase.clinic.name,
        product: labCase.product.name,
        date: new Date().toLocaleDateString(),
        lotNumbers: lots,
      };
      const body = applyTemplate(template.body, vars);

      const filename = `conformity-${ref.replace(/[^A-Za-z0-9-]/gu, '')}.pdf`;
      const keyPrefix = `lab-conformity/${user.tenantId}/${new Date().toISOString().slice(0, 10)}`;
      const stored = await this.pdf.renderToS3(keyPrefix, filename, (doc) => {
        this.pdf.drawLetterhead(doc, {
          labName: labCase.lab.name,
          labKindLabel:
            labCase.lab.kind === 'LAB' ? 'Dental laboratory' : undefined,
          docTitle: 'Declaration of Conformity',
          docRef: `Case ${ref} · ${labCase.product.name}`,
        });
        this.pdf.drawKeyValueGrid(doc, [
          { label: 'Patient', value: vars.patient },
          { label: 'Doctor', value: vars.doctor },
          { label: 'Clinic', value: vars.clinicName },
          { label: 'Product', value: vars.product },
          { label: 'Date', value: vars.date },
          { label: 'Template', value: template.name },
        ]);
        if (lots && lots !== '—') {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#666')
            .text('LOT NUMBERS USED');
          doc.font('Helvetica').fontSize(10).fillColor('black').text(lots);
          doc.moveDown(0.6);
        }
        doc.font('Helvetica').fontSize(11).fillColor('black').text(body, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          align: 'left',
        });
        this.pdf.drawFooter(doc, `${labCase.lab.name} · Conformity ${ref}`);
      });
      return this.pdf.presignDownload(stored.s3Key, stored.filename);
    });
  }

  private async requireLab(user: AuthenticatedUser) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { kind: true },
    });
    if (!t || t.kind !== 'LAB') {
      throw new ForbiddenException('only LAB tenants can manage compliance templates');
    }
  }
}
