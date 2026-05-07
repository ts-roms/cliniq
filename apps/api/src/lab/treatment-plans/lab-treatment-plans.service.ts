import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import {
  LabTreatmentPlanDecision,
  LabTreatmentPlanFileKind,
  LabTreatmentPlanStatus,
  PrismaService,
} from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { LabNotificationsService } from '../_shared/lab-notifications.service.js';
import { AiClientService } from '../../ai-client/ai-client.service.js';
import type {
  CreateTreatmentPlanDto,
  PresignTreatmentPlanFileDto,
  UpdateTreatmentPlanDto,
} from './dto/treatment-plan.dto.js';

@Injectable()
export class LabTreatmentPlansService {
  private readonly logger = new Logger(LabTreatmentPlansService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly presignTtlSec = 600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notify: LabNotificationsService,
    private readonly ai: AiClientService,
  ) {
    this.s3 = new S3Client({
      region: this.config.get<string>('AWS_REGION') ?? 'ap-southeast-1',
    });
    this.bucket = this.config.get<string>('S3_BUCKET_PHI') ?? 'cliniq-phi-dev';
  }

  // ── Lab side: compose ─────────────────────────────────────

  async createDraft(dto: CreateTreatmentPlanDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: dto.caseId, labTenantId: user.tenantId, deletedAt: null },
        select: { id: true, labTenantId: true, clinicTenantId: true },
      });
      if (!labCase) {
        throw new NotFoundException(
          'case not found (or not owned by this lab)',
        );
      }
      return tx.labTreatmentPlan.create({
        data: {
          caseId: labCase.id,
          labTenantId: labCase.labTenantId,
          clinicTenantId: labCase.clinicTenantId,
          title: dto.title,
          summary: dto.summary,
          status: LabTreatmentPlanStatus.DRAFT,
          createdByUserId: user.userId,
        },
        include: { files: { where: { deletedAt: null } } },
      });
    });
  }

  async update(id: string, dto: UpdateTreatmentPlanDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const plan = await this.loadEditableAsLab(tx, id, user.tenantId);
      return tx.labTreatmentPlan.update({
        where: { id },
        data: {
          title: dto.title ?? plan.title,
          summary: dto.summary ?? plan.summary,
        },
        include: { files: { where: { deletedAt: null } }, approvals: true },
      });
    });
  }

  /**
   * DRAFT or REVISION_REQUESTED → PROPOSED. Allocates a per-case revision
   * number on first proposal; on resubmissions after a revision request,
   * the revision counter ticks up.
   */
  async propose(id: string, user: AuthenticatedUser) {
    const plan = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.labTreatmentPlan.findFirst({
        where: { id, labTenantId: user.tenantId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('plan not found');
      const proposable: LabTreatmentPlanStatus[] = [
        LabTreatmentPlanStatus.DRAFT,
        LabTreatmentPlanStatus.REVISION_REQUESTED,
      ];
      if (!proposable.includes(existing.status)) {
        throw new BadRequestException(
          `cannot propose a ${existing.status} plan`,
        );
      }
      let revision = existing.revision;
      if (revision === null) {
        const max = await tx.labTreatmentPlan.aggregate({
          where: { caseId: existing.caseId },
          _max: { revision: true },
        });
        revision = (max._max.revision ?? 0) + 1;
      }
      const updated = await tx.labTreatmentPlan.update({
        where: { id },
        data: {
          status: LabTreatmentPlanStatus.PROPOSED,
          revision,
          proposedAt: new Date(),
          // Clear stale decision metadata when re-proposing after a revision
          // request — the new decision will write fresh values.
          decidedAt: null,
          decidedByUserId: null,
        },
        include: { files: { where: { deletedAt: null } }, approvals: true },
      });
      this.logger.log(
        `treatment plan ${id} proposed as rev ${revision} by ${user.userId}`,
      );
      return updated;
    });
    void this.notifyPlanProposed(plan.id).catch((err) =>
      this.logger.warn(`plan-proposed notify failed: ${(err as Error).message}`),
    );
    return plan;
  }

  // ── Reads ─────────────────────────────────────────────────

  async listForCase(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return tx.labTreatmentPlan.findMany({
        where: { caseId, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          files: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
          approvals: { orderBy: { decidedAt: 'desc' } },
        },
      });
    });
  }

  async findById(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const plan = await tx.labTreatmentPlan.findFirst({
        where: { id, deletedAt: null },
        include: {
          files: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
          approvals: { orderBy: { decidedAt: 'desc' } },
        },
      });
      if (!plan) throw new NotFoundException('plan not found');
      // Hide DRAFT plans from clinic side. RLS allows reads from either
      // tenant; this filter shields work-in-progress.
      if (
        plan.status === LabTreatmentPlanStatus.DRAFT &&
        plan.labTenantId !== user.tenantId
      ) {
        throw new NotFoundException('plan not found');
      }
      return plan;
    });
  }

  // ── Files ─────────────────────────────────────────────────

  async presignFile(
    planId: string,
    dto: PresignTreatmentPlanFileDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const plan = await this.loadEditableAsLab(tx, planId, user.tenantId);
      const ext = sanitizeExt(dto.filename);
      const key =
        `lab-treatment-plans/${plan.labTenantId}/${plan.id}/` +
        `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;

      const fileRow = await tx.labTreatmentPlanFile.create({
        data: {
          planId: plan.id,
          s3Key: key,
          filename: dto.filename,
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          kind: dto.kind ?? LabTreatmentPlanFileKind.OTHER,
          uploadedByUserId: user.userId,
          uploadedByTenantId: user.tenantId,
        },
      });
      const uploadUrl = await getSignedUrl(
        this.s3,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: dto.mimeType,
          ContentLength: dto.sizeBytes,
          ServerSideEncryption: 'aws:kms',
        }),
        { expiresIn: this.presignTtlSec },
      );
      return {
        fileId: fileRow.id,
        s3Key: key,
        uploadUrl,
        expiresInSec: this.presignTtlSec,
        headers: {
          'content-type': dto.mimeType,
          'x-amz-server-side-encryption': 'aws:kms',
        },
      };
    });
  }

  async deleteFile(planId: string, fileId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      await this.loadEditableAsLab(tx, planId, user.tenantId);
      const file = await tx.labTreatmentPlanFile.findFirst({
        where: { id: fileId, planId, deletedAt: null },
      });
      if (!file) throw new NotFoundException('file not found');
      await tx.labTreatmentPlanFile.update({
        where: { id: fileId },
        data: { deletedAt: new Date() },
      });
    });
  }

  // ── Clinic side: decide ──────────────────────────────────

  async decide(
    id: string,
    decision: LabTreatmentPlanDecision,
    notes: string | null,
    user: AuthenticatedUser,
  ) {
    const result = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const plan = await tx.labTreatmentPlan.findFirst({
        where: { id, clinicTenantId: user.tenantId, deletedAt: null },
      });
      if (!plan) {
        throw new NotFoundException(
          'plan not found (or not visible to this clinic)',
        );
      }
      if (plan.status !== LabTreatmentPlanStatus.PROPOSED) {
        throw new BadRequestException(
          `decisions only apply to PROPOSED plans (current: ${plan.status})`,
        );
      }
      const nextStatus =
        decision === LabTreatmentPlanDecision.APPROVED
          ? LabTreatmentPlanStatus.APPROVED
          : decision === LabTreatmentPlanDecision.REJECTED
            ? LabTreatmentPlanStatus.REJECTED
            : LabTreatmentPlanStatus.REVISION_REQUESTED;
      const now = new Date();
      const [, updated] = await Promise.all([
        tx.labTreatmentPlanApproval.create({
          data: {
            planId: plan.id,
            decision,
            decidedByUserId: user.userId,
            decidedByTenantId: user.tenantId,
            notes: notes ?? null,
            summarySnapshot: plan.summary,
            decidedAt: now,
          },
        }),
        tx.labTreatmentPlan.update({
          where: { id },
          data: {
            status: nextStatus,
            decidedAt: now,
            decidedByUserId: user.userId,
          },
          include: {
            files: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
            approvals: { orderBy: { decidedAt: 'desc' } },
          },
        }),
      ]);
      this.logger.log(
        `treatment plan ${id} ${decision} by clinic user ${user.userId}`,
      );
      return updated;
    });
    void this.notifyPlanDecided(result.id, decision, notes).catch((err) =>
      this.logger.warn(`plan-decided notify failed: ${(err as Error).message}`),
    );
    return result;
  }

  // ── Notifications ────────────────────────────────────────

  private async notifyPlanProposed(planId: string): Promise<void> {
    const plan = await this.prisma.withPlatformContext((tx) =>
      tx.labTreatmentPlan.findFirst({
        where: { id: planId, deletedAt: null },
        include: {
          case: {
            select: {
              refNumber: true,
              id: true,
              clinicTenantId: true,
              labTenantId: true,
              product: { select: { name: true } },
              lab: { select: { name: true } },
            },
          },
        },
      }),
    );
    if (!plan) return;
    const ref =
      plan.case.refNumber !== null ? `#${plan.case.refNumber}` : plan.case.id.slice(-6);
    const url = this.notify.webUrl(`/lab-cases/${plan.case.id}`);
    await this.notify.notifyOwner(plan.case.clinicTenantId, (r) => ({
      subject: `${plan.case.lab.name} proposed treatment plan for case ${ref}`,
      text:
        `Hi ${r.name ?? 'there'},\n\n` +
        `${plan.case.lab.name} has proposed a treatment plan for case ${ref} ` +
        `(${plan.case.product.name}, rev ${plan.revision ?? '—'}).\n\n` +
        `Title: ${plan.title}\n\n` +
        `Review and decide here: ${url}\n\n— ClinIQ Lab`,
    }));
  }

  private async notifyPlanDecided(
    planId: string,
    decision: LabTreatmentPlanDecision,
    notes: string | null,
  ): Promise<void> {
    const plan = await this.prisma.withPlatformContext((tx) =>
      tx.labTreatmentPlan.findFirst({
        where: { id: planId, deletedAt: null },
        include: {
          case: {
            select: {
              refNumber: true,
              id: true,
              labTenantId: true,
              product: { select: { name: true } },
              clinic: { select: { name: true } },
            },
          },
        },
      }),
    );
    if (!plan) return;
    const ref =
      plan.case.refNumber !== null ? `#${plan.case.refNumber}` : plan.case.id.slice(-6);
    const verb =
      decision === LabTreatmentPlanDecision.APPROVED
        ? 'approved'
        : decision === LabTreatmentPlanDecision.REJECTED
          ? 'rejected'
          : 'requested a revision on';
    const url = this.notify.webUrl(`/lab/cases/${plan.case.id}`);
    await this.notify.notifyOwner(plan.case.labTenantId, (r) => ({
      subject: `${plan.case.clinic.name} ${verb} the treatment plan for case ${ref}`,
      text:
        `Hi ${r.name ?? 'there'},\n\n` +
        `${plan.case.clinic.name} ${verb} the treatment plan for case ${ref} ` +
        `(${plan.case.product.name}).\n` +
        (notes ? `\nNotes: ${notes}\n` : '') +
        `\nOpen it: ${url}\n\n— ClinIQ Lab`,
    }));
  }

  // ── AI assist ────────────────────────────────────────────

  /**
   * Hand a case to the ai-service and get back a draft markdown summary
   * the lab can use as a starting point. We pull form data, urgency,
   * notes, and any logged material lots — that's the context the prompt
   * was tuned on. Lab-only.
   */
  async draftSummary(caseId: string, user: AuthenticatedUser): Promise<{ summary: string }> {
    const ctx = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, labTenantId: user.tenantId, deletedAt: null },
        include: {
          product: { select: { name: true } },
          materialUsages: { include: { lot: { include: { material: true } } } },
        },
      });
      if (!labCase) {
        throw new NotFoundException('case not found (or not owned by this lab)');
      }
      return labCase;
    });
    const formData = (ctx.formData ?? null) as Record<string, unknown> | null;
    const result = await this.ai.draftLabTreatmentPlan({
      case: {
        refNumber: ctx.refNumber,
        productName: ctx.product.name,
        urgency: ctx.urgency,
        patientLabel: ctx.patientLabel,
        doctorLabel: ctx.doctorLabel,
        notes: ctx.notes,
        formData,
      },
      materialsUsed: ctx.materialUsages.map((u) => ({
        material: u.lot.material.name,
        lot: u.lot.lotNumber,
      })),
    });
    this.logger.log(
      `ai draft for case ${caseId}: model=${result.model} tokens=${result.inputTokens}/${result.outputTokens} latency=${result.latencyMs}ms`,
    );
    return { summary: result.summary };
  }

  // ── Helpers ──────────────────────────────────────────────

  private async loadEditableAsLab(
    tx: Pick<PrismaService, 'labTreatmentPlan'>,
    planId: string,
    labTenantId: string,
  ) {
    const plan = await tx.labTreatmentPlan.findFirst({
      where: { id: planId, labTenantId, deletedAt: null },
    });
    if (!plan) throw new NotFoundException('plan not found');
    const editable: LabTreatmentPlanStatus[] = [
      LabTreatmentPlanStatus.DRAFT,
      LabTreatmentPlanStatus.REVISION_REQUESTED,
    ];
    if (!editable.includes(plan.status)) {
      throw new ForbiddenException(
        `plan is ${plan.status}; only DRAFT or REVISION_REQUESTED plans are editable`,
      );
    }
    return plan;
  }
}

function sanitizeExt(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  const ext = name.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}
