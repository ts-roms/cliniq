import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import {
  LabCaseFileStatus,
  LabCaseStatus,
  LabCaseUrgency,
  LabProductPricingMode,
  PrismaService,
} from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { LabClinicLinksService } from '../clinic-links/lab-clinic-links.service.js';
import type {
  CreateLabCaseDto,
  PresignLabCaseFileDto,
  TransitionLabCaseDto,
  UpdateLabCaseDto,
} from './dto/case.dto.js';

/**
 * Allowed status transitions. Both sides can drive depending on phase:
 *   - Clinic: DRAFT → SUBMITTED, * → CANCELLED (before IN_PROGRESS).
 *   - Lab:    SUBMITTED → IN_PROGRESS|REJECTED,
 *             IN_PROGRESS → AWAITING_PICKUP|SHIPPED,
 *             AWAITING_PICKUP/SHIPPED → DELIVERED.
 */
const TRANSITIONS: Record<LabCaseStatus, LabCaseStatus[]> = {
  DRAFT:           [LabCaseStatus.SUBMITTED, LabCaseStatus.CANCELLED],
  SUBMITTED:       [LabCaseStatus.IN_PROGRESS, LabCaseStatus.REJECTED, LabCaseStatus.CANCELLED],
  IN_PROGRESS:     [LabCaseStatus.AWAITING_PICKUP, LabCaseStatus.SHIPPED, LabCaseStatus.CANCELLED],
  AWAITING_PICKUP: [LabCaseStatus.DELIVERED, LabCaseStatus.SHIPPED],
  SHIPPED:         [LabCaseStatus.DELIVERED],
  DELIVERED:       [],
  CANCELLED:       [],
  REJECTED:        [],
};

@Injectable()
export class LabCasesService {
  private readonly logger = new Logger(LabCasesService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly presignTtlSec = 600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly links: LabClinicLinksService,
  ) {
    this.s3 = new S3Client({
      region: this.config.get<string>('AWS_REGION') ?? 'ap-southeast-1',
    });
    // Lab files (STL/ZIP/PDF/photos) go to the PHI bucket — they often
    // contain patient-identifiable scan data even when "anonymous."
    this.bucket = this.config.get<string>('S3_BUCKET_PHI') ?? 'cliniq-phi-dev';
  }

  // ── Clinic-side: create + submit ─────────────────────────

  async createDraft(dto: CreateLabCaseDto, user: AuthenticatedUser) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { kind: true },
    });
    if (!tenant || tenant.kind !== 'CLINIC') {
      throw new ForbiddenException('only CLINIC tenants can create cases');
    }
    const linked = await this.links.isLinkActive(dto.labTenantId, user.tenantId);
    if (!linked) {
      throw new ForbiddenException('your clinic has no active link with that lab');
    }

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const product = await tx.labProduct.findFirst({
        where: { id: dto.productId, tenantId: dto.labTenantId, deletedAt: null, isActive: true },
      });
      if (!product) throw new BadRequestException('product not found / inactive');

      const unitPrice =
        product.pricingMode === LabProductPricingMode.ADJUST_ON_ORDER
          ? null
          : product.defaultPrice;

      return tx.labCase.create({
        data: {
          labTenantId: dto.labTenantId,
          clinicTenantId: user.tenantId,
          productId: product.id,
          unitPrice: unitPrice ?? null,
          currency: product.currency,
          status: LabCaseStatus.DRAFT,
          urgency: dto.urgency ?? LabCaseUrgency.STANDARD,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          formData: dto.formData ?? undefined,
          patientLabel: dto.patientLabel ?? null,
          doctorLabel: dto.doctorLabel ?? null,
          deliveryCenter: dto.deliveryCenter ?? null,
          notes: dto.notes ?? null,
          createdByUserId: user.userId,
        },
      });
    });
  }

  /** Clinic-side update of mutable fields (only valid in DRAFT). */
  async updateAsClinic(id: string, dto: UpdateLabCaseDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.labCase.findFirst({
        where: { id, clinicTenantId: user.tenantId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('case not found');
      if (existing.status !== LabCaseStatus.DRAFT) {
        throw new BadRequestException('only DRAFT cases are editable by the clinic');
      }
      if (dto.unitPrice !== undefined) {
        throw new ForbiddenException('clinic cannot set unitPrice');
      }
      return tx.labCase.update({
        where: { id },
        data: this.mergeUpdate(dto, existing),
      });
    });
  }

  async updateAsLab(id: string, dto: UpdateLabCaseDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.labCase.findFirst({
        where: { id, labTenantId: user.tenantId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('case not found');
      return tx.labCase.update({
        where: { id },
        data: this.mergeUpdate(dto, existing),
      });
    });
  }

  // ── Lookups ──────────────────────────────────────────────

  async listForLab(
    user: AuthenticatedUser,
    opts?: { status?: LabCaseStatus; tagId?: string },
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labCase.findMany({
        where: {
          labTenantId: user.tenantId,
          deletedAt: null,
          ...(opts?.status ? { status: opts.status } : {}),
          ...(opts?.tagId
            ? { tagAssignments: { some: { tagId: opts.tagId } } }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          product: { select: { id: true, name: true } },
          clinic: { select: { id: true, slug: true, name: true } },
          _count: { select: { files: true } },
          tagAssignments: {
            include: { tag: true },
          },
        },
      }),
    );
  }

  async listForClinic(user: AuthenticatedUser, opts?: { status?: LabCaseStatus }) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labCase.findMany({
        where: {
          clinicTenantId: user.tenantId,
          deletedAt: null,
          ...(opts?.status ? { status: opts.status } : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          product: { select: { id: true, name: true } },
          lab: { select: { id: true, slug: true, name: true } },
          _count: { select: { files: true } },
        },
      }),
    );
  }

  async findById(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id, deletedAt: null },
        include: {
          product: true,
          lab: { select: { id: true, slug: true, name: true } },
          clinic: { select: { id: true, slug: true, name: true } },
          files: { where: { deletedAt: null }, orderBy: [{ createdAt: 'asc' }] },
        },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return labCase;
    });
  }

  // ── Transitions ──────────────────────────────────────────

  async transition(
    id: string,
    dto: TransitionLabCaseDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id, deletedAt: null },
      });
      if (!labCase) throw new NotFoundException('case not found');

      const allowed = TRANSITIONS[labCase.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `cannot transition from ${labCase.status} to ${dto.status}`,
        );
      }

      const isLab = labCase.labTenantId === user.tenantId;
      const isClinic = labCase.clinicTenantId === user.tenantId;
      this.assertActorAllowed(labCase.status, dto.status, isLab, isClinic);

      // refNumber is allocated when SUBMITTED is reached. Race-prone for
      // concurrent submits; acceptable for MVP — swap to a counter table later.
      let refNumber = labCase.refNumber;
      if (
        dto.status === LabCaseStatus.SUBMITTED &&
        labCase.status === LabCaseStatus.DRAFT &&
        refNumber === null
      ) {
        const max = await tx.labCase.aggregate({
          where: { labTenantId: labCase.labTenantId },
          _max: { refNumber: true },
        });
        refNumber = (max._max.refNumber ?? 0) + 1;
      }

      const now = new Date();
      const updates: Record<string, unknown> = {
        status: dto.status,
        refNumber,
      };
      if (dto.status === LabCaseStatus.SUBMITTED) updates.submittedAt = now;
      if (dto.status === LabCaseStatus.IN_PROGRESS) {
        updates.acceptedAt = now;
        if (isLab) updates.acceptedByUserId = user.userId;
      }
      if (dto.status === LabCaseStatus.AWAITING_PICKUP) updates.completedAt = now;
      if (dto.status === LabCaseStatus.SHIPPED) updates.shippedAt = now;
      if (dto.status === LabCaseStatus.DELIVERED) updates.deliveredAt = now;
      if (dto.status === LabCaseStatus.CANCELLED) updates.cancelledAt = now;
      if (dto.status === LabCaseStatus.REJECTED) updates.cancelledAt = now;

      this.logger.log(
        `lab case ${id} transitioned ${labCase.status} → ${dto.status} by ${user.userId} (tenant ${user.tenantId})`,
      );

      return tx.labCase.update({ where: { id }, data: updates });
    });
  }

  // ── Files ────────────────────────────────────────────────

  async presignUpload(
    caseId: string,
    dto: PresignLabCaseFileDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
      });
      if (!labCase) throw new NotFoundException('case not found');
      const frozen: LabCaseStatus[] = [
        LabCaseStatus.DELIVERED,
        LabCaseStatus.CANCELLED,
        LabCaseStatus.REJECTED,
      ];
      if (frozen.includes(labCase.status)) {
        throw new BadRequestException('case is closed; uploads disallowed');
      }

      const ext = sanitizeExt(dto.filename);
      const key =
        `lab-cases/${labCase.labTenantId}/${labCase.id}/` +
        `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;

      const fileRow = await tx.labCaseFile.create({
        data: {
          caseId: labCase.id,
          s3Key: key,
          filename: dto.filename,
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          uploadedByUserId: user.userId,
          uploadedByTenantId: user.tenantId,
          status: LabCaseFileStatus.PENDING,
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

  async confirmUpload(caseId: string, fileId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const file = await tx.labCaseFile.findFirst({
        where: { id: fileId, caseId, deletedAt: null },
      });
      if (!file) throw new NotFoundException('file not found');
      if (file.status === LabCaseFileStatus.READY) return file;
      return tx.labCaseFile.update({
        where: { id: fileId },
        data: { status: LabCaseFileStatus.READY, confirmedAt: new Date() },
      });
    });
  }

  async deleteFile(caseId: string, fileId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const file = await tx.labCaseFile.findFirst({
        where: { id: fileId, caseId, deletedAt: null },
      });
      if (!file) throw new NotFoundException('file not found');
      await tx.labCaseFile.update({
        where: { id: fileId },
        data: { deletedAt: new Date() },
      });
      // Note: the S3 object is left in place; a janitor sweeps soft-deleted
      // rows older than the retention window. Same pattern as FilesService.
    });
  }

  // ── Phase tracker ────────────────────────────────────────

  /**
   * List all phase events on a case (current + past), oldest first.
   * Both lab and clinic can read. RLS gates visibility.
   */
  async listPhases(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return tx.labCasePhaseEvent.findMany({
        where: { caseId },
        orderBy: { enteredAt: 'asc' },
      });
    });
  }

  /**
   * Lab-only: advance the case to a target phase. Closes the open phase
   * (sets exitedAt = now) and inserts a new open one. Validates the
   * target phase exists in the product's `phases` array.
   *
   * If `phase` is omitted, advances to the next phase after the current
   * one in the product's declared order.
   */
  async advancePhase(
    caseId: string,
    targetPhase: string | undefined,
    user: AuthenticatedUser,
    notes?: string,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        include: { product: { select: { phases: true } } },
      });
      if (!labCase) throw new NotFoundException('case not found');
      if (labCase.labTenantId !== user.tenantId) {
        throw new ForbiddenException('only the lab can advance phases');
      }
      if (labCase.status !== LabCaseStatus.IN_PROGRESS) {
        throw new BadRequestException(
          `phases only advance while case is IN_PROGRESS (current: ${labCase.status})`,
        );
      }
      const phases = labCase.product.phases;
      if (phases.length === 0) {
        throw new BadRequestException(
          'product has no phases defined — set them on the catalog product first',
        );
      }

      const open = await tx.labCasePhaseEvent.findFirst({
        where: { caseId, exitedAt: null },
      });

      let next: string;
      if (targetPhase) {
        if (!phases.includes(targetPhase)) {
          throw new BadRequestException(
            `phase "${targetPhase}" is not in the product's phases (${phases.join(', ')})`,
          );
        }
        next = targetPhase;
      } else if (open) {
        const idx = phases.indexOf(open.phase);
        if (idx < 0 || idx === phases.length - 1) {
          throw new BadRequestException('already at the last phase');
        }
        next = phases[idx + 1];
      } else {
        next = phases[0];
      }

      const now = new Date();
      if (open) {
        if (open.phase === next) {
          throw new BadRequestException(`already in phase "${next}"`);
        }
        await tx.labCasePhaseEvent.update({
          where: { id: open.id },
          data: { exitedAt: now },
        });
      }
      return tx.labCasePhaseEvent.create({
        data: {
          caseId,
          phase: next,
          enteredByUserId: user.userId,
          enteredAt: now,
          notes: notes ?? null,
        },
      });
    });
  }

  // ── Internal notes (lab-only) ────────────────────────────

  async listNotes(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null, labTenantId: user.tenantId },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return tx.labCaseNote.findMany({
        where: { caseId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async createNote(caseId: string, body: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null, labTenantId: user.tenantId },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return tx.labCaseNote.create({
        data: { caseId, body, authorUserId: user.userId },
      });
    });
  }

  async updateNote(
    caseId: string,
    noteId: string,
    body: string,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const note = await tx.labCaseNote.findFirst({
        where: { id: noteId, caseId, deletedAt: null },
      });
      if (!note) throw new NotFoundException('note not found');
      // Authors can edit their own notes; other lab users can't.
      if (note.authorUserId !== user.userId) {
        throw new ForbiddenException('only the author can edit this note');
      }
      return tx.labCaseNote.update({
        where: { id: noteId },
        data: { body },
      });
    });
  }

  async deleteNote(caseId: string, noteId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const note = await tx.labCaseNote.findFirst({
        where: { id: noteId, caseId, deletedAt: null },
      });
      if (!note) throw new NotFoundException('note not found');
      if (note.authorUserId !== user.userId) {
        throw new ForbiddenException('only the author can delete this note');
      }
      await tx.labCaseNote.update({
        where: { id: noteId },
        data: { deletedAt: new Date() },
      });
    });
  }

  // ── Per-case chat (both sides) ───────────────────────────

  async listMessages(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return tx.labCaseMessage.findMany({
        where: { caseId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async createMessage(caseId: string, body: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return tx.labCaseMessage.create({
        data: {
          caseId,
          body,
          senderUserId: user.userId,
          senderTenantId: user.tenantId,
        },
      });
    });
  }

  async deleteMessage(caseId: string, messageId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const msg = await tx.labCaseMessage.findFirst({
        where: { id: messageId, caseId, deletedAt: null },
      });
      if (!msg) throw new NotFoundException('message not found');
      if (msg.senderUserId !== user.userId) {
        throw new ForbiddenException('only the sender can retract');
      }
      await tx.labCaseMessage.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });
    });
  }

  // ── Shipments ────────────────────────────────────────────

  async getShipment(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return tx.labShipment.findUnique({ where: { caseId } });
    });
  }

  /** Lab-only: create or update the shipment record. */
  async upsertShipment(
    caseId: string,
    input: { carrier?: string | null; trackingNumber?: string | null; notes?: string | null },
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null, labTenantId: user.tenantId },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return tx.labShipment.upsert({
        where: { caseId },
        create: {
          caseId,
          carrier: input.carrier ?? null,
          trackingNumber: input.trackingNumber ?? null,
          notes: input.notes ?? null,
        },
        update: {
          carrier: input.carrier ?? undefined,
          trackingNumber: input.trackingNumber ?? undefined,
          notes: input.notes ?? undefined,
        },
      });
    });
  }

  /** Either side can mark the shipment delivered. */
  async markShipmentDelivered(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true, labTenantId: true, clinicTenantId: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      if (
        labCase.labTenantId !== user.tenantId &&
        labCase.clinicTenantId !== user.tenantId
      ) {
        throw new ForbiddenException('not your case');
      }
      const ship = await tx.labShipment.findUnique({ where: { caseId } });
      if (!ship) throw new NotFoundException('no shipment yet');
      return tx.labShipment.update({
        where: { caseId },
        data: { deliveredAt: new Date() },
      });
    });
  }

  // ── Private helpers ──────────────────────────────────────

  private assertActorAllowed(
    fromStatus: LabCaseStatus,
    toStatus: LabCaseStatus,
    isLab: boolean,
    isClinic: boolean,
  ) {
    if (toStatus === LabCaseStatus.SUBMITTED && !isClinic) {
      throw new ForbiddenException('only the clinic can submit a draft');
    }
    if (toStatus === LabCaseStatus.REJECTED && !isLab) {
      throw new ForbiddenException('only the lab can reject');
    }
    const labOnly: LabCaseStatus[] = [
      LabCaseStatus.IN_PROGRESS,
      LabCaseStatus.AWAITING_PICKUP,
      LabCaseStatus.SHIPPED,
    ];
    if (labOnly.includes(toStatus) && !isLab) {
      throw new ForbiddenException('only the lab can drive manufacturing transitions');
    }
    void fromStatus;
  }

  private mergeUpdate(
    dto: UpdateLabCaseDto,
    existing: {
      dueAt: Date | null;
      urgency: LabCaseUrgency;
      formData: unknown;
      patientLabel: string | null;
      doctorLabel: string | null;
      deliveryCenter: string | null;
      notes: string | null;
      unitPrice: number | null;
    },
  ) {
    return {
      urgency: dto.urgency ?? existing.urgency,
      dueAt:
        dto.dueAt === undefined
          ? existing.dueAt
          : dto.dueAt === null
            ? null
            : new Date(dto.dueAt),
      formData: dto.formData === undefined ? undefined : (dto.formData ?? undefined),
      patientLabel:
        dto.patientLabel === undefined ? existing.patientLabel : dto.patientLabel,
      doctorLabel:
        dto.doctorLabel === undefined ? existing.doctorLabel : dto.doctorLabel,
      deliveryCenter:
        dto.deliveryCenter === undefined ? existing.deliveryCenter : dto.deliveryCenter,
      notes: dto.notes === undefined ? existing.notes : dto.notes,
      unitPrice: dto.unitPrice === undefined ? existing.unitPrice : dto.unitPrice,
    };
  }
}

function sanitizeExt(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  const ext = name.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}
