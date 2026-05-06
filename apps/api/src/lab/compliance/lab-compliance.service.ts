import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
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
  constructor(private readonly prisma: PrismaService) {}

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
