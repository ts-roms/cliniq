import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  DentalLabCaseFileStatus,
  DentalLabCaseStatus,
  DentalLabCaseUrgency,
  DentalLabProductPricingMode,
  PrismaService,
  type InputJsonValue,
} from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { DentalLabClinicLinksService } from '../clinic-links/dental-lab-clinic-links.service.js';
import { DentalLabNotificationsService } from '../_shared/dental-lab-notifications.service.js';
import { clampLimit, clampOffset } from '../../common/pagination.js';
import type {
  CreateLabCaseDto,
  PresignLabCaseFileDto,
  TransitionLabCaseDto,
  UpdateLabCaseDto,
} from './dto/case.dto.js';
import { DentalLabCounterpartyService } from '../_shared/counterparty.service.js';

/**
 * Allowed status transitions. Both sides can drive depending on phase:
 *   - Clinic: DRAFT → SUBMITTED, * → CANCELLED (before IN_PROGRESS).
 *   - Lab:    SUBMITTED → IN_PROGRESS|REJECTED,
 *             IN_PROGRESS → AWAITING_PICKUP|SHIPPED,
 *             AWAITING_PICKUP/SHIPPED → DELIVERED.
 */
const TRANSITIONS: Record<DentalLabCaseStatus, DentalLabCaseStatus[]> = {
  DRAFT: [DentalLabCaseStatus.SUBMITTED, DentalLabCaseStatus.CANCELLED],
  SUBMITTED: [
    DentalLabCaseStatus.IN_PROGRESS,
    DentalLabCaseStatus.REJECTED,
    DentalLabCaseStatus.CANCELLED,
  ],
  IN_PROGRESS: [
    DentalLabCaseStatus.AWAITING_PICKUP,
    DentalLabCaseStatus.SHIPPED,
    DentalLabCaseStatus.CANCELLED,
  ],
  AWAITING_PICKUP: [DentalLabCaseStatus.DELIVERED, DentalLabCaseStatus.SHIPPED],
  SHIPPED: [DentalLabCaseStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
  REJECTED: [],
};

@Injectable()
export class DentalLabCasesService {
  private readonly logger = new Logger(DentalLabCasesService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly presignTtlSec = 600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly links: DentalLabClinicLinksService,
    private readonly notify: DentalLabNotificationsService,
    private readonly counterparty: DentalLabCounterpartyService,
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
    const tenant = await this.prisma.getTenantContext(user.tenantId);
    if (!tenant || tenant.kind !== 'CLINIC') {
      throw new ForbiddenException('only CLINIC tenants can create cases');
    }
    const linked = await this.links.isLinkActive(
      dto.labTenantId,
      user.tenantId,
    );
    if (!linked) {
      throw new ForbiddenException(
        'your clinic has no active link with that lab',
      );
    }

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const product = await tx.dentalLabProduct.findFirst({
        where: {
          id: dto.productId,
          tenantId: dto.labTenantId,
          deletedAt: null,
          isActive: true,
        },
      });
      if (!product)
        throw new BadRequestException('product not found / inactive');

      const unitPrice =
        product.pricingMode === DentalLabProductPricingMode.ADJUST_ON_ORDER
          ? null
          : product.defaultPrice;

      return tx.dentalLabCase.create({
        data: {
          labTenantId: dto.labTenantId,
          clinicTenantId: user.tenantId,
          productId: product.id,
          unitPrice: unitPrice ?? null,
          currency: product.currency,
          status: DentalLabCaseStatus.DRAFT,
          urgency: dto.urgency ?? DentalLabCaseUrgency.STANDARD,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          formData: (dto.formData ?? undefined) as InputJsonValue | undefined,
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
  async updateAsClinic(
    id: string,
    dto: UpdateLabCaseDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.dentalLabCase.findFirst({
        where: { id, clinicTenantId: user.tenantId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('case not found');
      if (existing.status !== DentalLabCaseStatus.DRAFT) {
        throw new BadRequestException(
          'only DRAFT cases are editable by the clinic',
        );
      }
      if (dto.unitPrice !== undefined) {
        throw new ForbiddenException('clinic cannot set unitPrice');
      }
      return tx.dentalLabCase.update({
        where: { id },
        data: this.mergeUpdate(dto, existing),
      });
    });
  }

  async updateAsLab(
    id: string,
    dto: UpdateLabCaseDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.dentalLabCase.findFirst({
        where: { id, labTenantId: user.tenantId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('case not found');
      return tx.dentalLabCase.update({
        where: { id },
        data: this.mergeUpdate(dto, existing),
      });
    });
  }

  // ── Lookups ──────────────────────────────────────────────

  async listForLab(
    user: AuthenticatedUser,
    opts?: {
      status?: DentalLabCaseStatus;
      tagId?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const rows = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      (tx) =>
        tx.dentalLabCase.findMany({
          where: {
            labTenantId: user.tenantId,
            deletedAt: null,
            ...(opts?.status ? { status: opts.status } : {}),
            ...(opts?.tagId
              ? { tagAssignments: { some: { tagId: opts.tagId } } }
              : {}),
          },
          orderBy: [{ createdAt: 'desc' }],
          take: clampLimit(opts?.limit),
          skip: clampOffset(opts?.offset),
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
    // RLS hides the counterparty tenant — see DentalLabCounterpartyService.
    return this.counterparty.hydrate(rows);
  }

  async listForClinic(
    user: AuthenticatedUser,
    opts?: { status?: DentalLabCaseStatus; limit?: number; offset?: number },
  ) {
    const rows = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      (tx) =>
        tx.dentalLabCase.findMany({
          where: {
            clinicTenantId: user.tenantId,
            deletedAt: null,
            ...(opts?.status ? { status: opts.status } : {}),
          },
          orderBy: [{ createdAt: 'desc' }],
          take: clampLimit(opts?.limit),
          skip: clampOffset(opts?.offset),
          include: {
            product: { select: { id: true, name: true } },
            lab: { select: { id: true, slug: true, name: true } },
            _count: { select: { files: true } },
          },
        }),
    );
    // RLS hides the counterparty tenant — see DentalLabCounterpartyService.
    return this.counterparty.hydrate(rows);
  }

  async findById(id: string, user: AuthenticatedUser) {
    const found = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      async (tx) => {
        const dentalLabCase = await tx.dentalLabCase.findFirst({
          where: { id, deletedAt: null },
          include: {
            product: true,
            lab: { select: { id: true, slug: true, name: true } },
            clinic: { select: { id: true, slug: true, name: true } },
            files: {
              where: { deletedAt: null },
              orderBy: [{ createdAt: 'asc' }],
            },
          },
        });
        if (!dentalLabCase) throw new NotFoundException('case not found');
        return dentalLabCase;
      },
    );
    // RLS hides the counterparty tenant — see DentalLabCounterpartyService.
    return this.counterparty.hydrate(found);
  }

  // ── Transitions ──────────────────────────────────────────

  async transition(
    id: string,
    dto: TransitionLabCaseDto,
    user: AuthenticatedUser,
  ) {
    const updated = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      async (tx) => {
        const dentalLabCase = await tx.dentalLabCase.findFirst({
          where: { id, deletedAt: null },
        });
        if (!dentalLabCase) throw new NotFoundException('case not found');

        const allowed = TRANSITIONS[dentalLabCase.status] ?? [];
        if (!allowed.includes(dto.status)) {
          throw new BadRequestException(
            `cannot transition from ${dentalLabCase.status} to ${dto.status}`,
          );
        }

        const isLab = dentalLabCase.labTenantId === user.tenantId;
        const isClinic = dentalLabCase.clinicTenantId === user.tenantId;
        this.assertActorAllowed(
          dentalLabCase.status,
          dto.status,
          isLab,
          isClinic,
        );

        // refNumber is allocated when SUBMITTED is reached. Race-prone for
        // concurrent submits; acceptable for MVP — swap to a counter table later.
        let refNumber = dentalLabCase.refNumber;
        if (
          dto.status === DentalLabCaseStatus.SUBMITTED &&
          dentalLabCase.status === DentalLabCaseStatus.DRAFT &&
          refNumber === null
        ) {
          const max = await tx.dentalLabCase.aggregate({
            where: { labTenantId: dentalLabCase.labTenantId },
            _max: { refNumber: true },
          });
          refNumber = (max._max.refNumber ?? 0) + 1;
        }

        const now = new Date();
        const updates: Record<string, unknown> = {
          status: dto.status,
          refNumber,
        };
        if (dto.status === DentalLabCaseStatus.SUBMITTED)
          updates.submittedAt = now;
        if (dto.status === DentalLabCaseStatus.IN_PROGRESS) {
          updates.acceptedAt = now;
          if (isLab) updates.acceptedByUserId = user.userId;
        }
        if (dto.status === DentalLabCaseStatus.AWAITING_PICKUP)
          updates.completedAt = now;
        if (dto.status === DentalLabCaseStatus.SHIPPED) updates.shippedAt = now;
        if (dto.status === DentalLabCaseStatus.DELIVERED)
          updates.deliveredAt = now;
        if (dto.status === DentalLabCaseStatus.CANCELLED)
          updates.cancelledAt = now;
        if (dto.status === DentalLabCaseStatus.REJECTED)
          updates.cancelledAt = now;

        this.logger.log(
          `lab case ${id} transitioned ${dentalLabCase.status} → ${dto.status} by ${user.userId} (tenant ${user.tenantId})`,
        );

        return tx.dentalLabCase.update({ where: { id }, data: updates });
      },
    );
    // Fire-and-forget notifications. We notify the *other* side of the
    // transition — the actor doesn't need an email about their own action.
    void this.notifyTransition(updated.id, dto.status, dto.reason).catch(
      (err) =>
        this.logger.warn(
          `case-transition notify failed: ${(err as Error).message}`,
        ),
    );
    return updated;
  }

  /**
   * Dispatch an email when a case transitions. Targets the OTHER side of
   * the lab/clinic relationship (the actor obviously knows). Best-effort.
   */
  private async notifyTransition(
    caseId: string,
    status: DentalLabCaseStatus,
    reason: string | undefined,
  ): Promise<void> {
    const lc = await this.prisma.withPlatformContext((tx) =>
      tx.dentalLabCase.findFirst({
        where: { id: caseId, deletedAt: null },
        include: {
          lab: { select: { id: true, name: true } },
          clinic: { select: { id: true, name: true } },
          product: { select: { name: true } },
        },
      }),
    );
    if (!lc) return;
    const ref = lc.refNumber !== null ? `#${lc.refNumber}` : lc.id.slice(-6);
    const url = (path: string) => this.notify.webUrl(path);

    // SUBMITTED → notify lab. Other lab-driven transitions notify clinic.
    if (status === DentalLabCaseStatus.SUBMITTED) {
      await this.notify.notifyOwner(lc.labTenantId, (r) => ({
        subject: `New lab case ${ref} from ${lc.clinic.name}`,
        text:
          `Hi ${r.name ?? 'there'},\n\n` +
          `${lc.clinic.name} just submitted case ${ref} (${lc.product.name}).\n\n` +
          `Open it: ${url(`/lab/cases/${lc.id}`)}\n\n— ClinIQ Lab`,
        link: `/lab/cases/${lc.id}`,
        entityId: lc.id,
      }));
      return;
    }
    const clinicEvents: Partial<Record<DentalLabCaseStatus, string>> = {
      [DentalLabCaseStatus.IN_PROGRESS]: 'accepted and started',
      [DentalLabCaseStatus.REJECTED]: 'rejected',
      [DentalLabCaseStatus.AWAITING_PICKUP]: 'completed and is awaiting pickup',
      [DentalLabCaseStatus.SHIPPED]: 'shipped',
      [DentalLabCaseStatus.DELIVERED]: 'marked delivered',
      [DentalLabCaseStatus.CANCELLED]: 'cancelled',
    };
    const verb = clinicEvents[status];
    if (!verb) return;
    await this.notify.notifyOwner(lc.clinicTenantId, (r) => ({
      subject: `Case ${ref} ${status === DentalLabCaseStatus.REJECTED ? 'rejected' : 'updated'} by ${lc.lab.name}`,
      text:
        `Hi ${r.name ?? 'there'},\n\n` +
        `${lc.lab.name} ${verb} your case ${ref} (${lc.product.name}).\n` +
        (reason ? `\nReason: ${reason}\n` : '') +
        `\nOpen it: ${url(`/lab-cases/${lc.id}`)}\n\n— ClinIQ Lab`,
      link: `/lab-cases/${lc.id}`,
      entityId: lc.id,
    }));
  }

  // ── Files ────────────────────────────────────────────────

  async presignUpload(
    caseId: string,
    dto: PresignLabCaseFileDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const dentalLabCase = await tx.dentalLabCase.findFirst({
        where: { id: caseId, deletedAt: null },
      });
      if (!dentalLabCase) throw new NotFoundException('case not found');
      const frozen: DentalLabCaseStatus[] = [
        DentalLabCaseStatus.DELIVERED,
        DentalLabCaseStatus.CANCELLED,
        DentalLabCaseStatus.REJECTED,
      ];
      if (frozen.includes(dentalLabCase.status)) {
        throw new BadRequestException('case is closed; uploads disallowed');
      }

      const ext = sanitizeExt(dto.filename);
      const key =
        `lab-cases/${dentalLabCase.labTenantId}/${dentalLabCase.id}/` +
        `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;

      const fileRow = await tx.dentalLabCaseFile.create({
        data: {
          caseId: dentalLabCase.id,
          s3Key: key,
          filename: dto.filename,
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          uploadedByUserId: user.userId,
          uploadedByTenantId: user.tenantId,
          status: DentalLabCaseFileStatus.PENDING,
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
    const confirmed = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      async (tx) => {
        const file = await tx.dentalLabCaseFile.findFirst({
          where: { id: fileId, caseId, deletedAt: null },
        });
        if (!file) throw new NotFoundException('file not found');
        if (file.status === DentalLabCaseFileStatus.READY) return file;
        return tx.dentalLabCaseFile.update({
          where: { id: fileId },
          data: {
            status: DentalLabCaseFileStatus.READY,
            confirmedAt: new Date(),
          },
        });
      },
    );
    // Best-effort image optimization. Runs after the row is READY so that
    // browsers fetching via presigned URL get the optimized version. We
    // re-encode JPEG/PNG/WebP at quality 85 and cap at 2000px on the long
    // edge — this routinely halves the payload for phone photos.
    void this.optimizeIfImage(
      confirmed.id,
      confirmed.s3Key,
      confirmed.mimeType,
    ).catch((err) =>
      this.logger.warn(`image optimize failed: ${(err as Error).message}`),
    );
    return confirmed;
  }

  private async optimizeIfImage(
    fileId: string,
    s3Key: string,
    mimeType: string,
  ): Promise<void> {
    if (!OPTIMIZABLE_IMAGE_TYPES.has(mimeType.toLowerCase())) return;
    const original = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
    );
    const body = original.Body;
    if (!body) return;
    // S3 SDK returns a Web ReadableStream-ish; collect it.
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const input = Buffer.concat(chunks);
    const optimized = await sharp(input, { failOn: 'none' })
      .rotate() // honor EXIF orientation before resize
      .resize({
        width: 2000,
        height: 2000,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    if (optimized.byteLength >= input.byteLength) {
      // Re-encoded file isn't smaller — leave the original alone (e.g.
      // already-tight JPEG, or a small PNG that grew when re-encoded).
      return;
    }
    // Overwrite the same key. Bump the row's sizeBytes + mimeType so the
    // listing UI shows the new size. Server-side encryption stays the same
    // (KMS) — `PutObjectCommand` requires us to re-state it.
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: optimized,
        ContentType: 'image/jpeg',
        ServerSideEncryption: 'aws:kms',
      }),
    );
    // Update the file row outside the original request context. Use
    // platform context — RLS would otherwise reject this update because
    // we no longer have an `app.current_tenant` set.
    await this.prisma.withPlatformContext((tx) =>
      tx.dentalLabCaseFile.update({
        where: { id: fileId },
        data: {
          sizeBytes: optimized.byteLength,
          mimeType: 'image/jpeg',
        },
      }),
    );
    this.logger.log(
      `image optimized ${s3Key}: ${input.byteLength} → ${optimized.byteLength} bytes (${Math.round((1 - optimized.byteLength / input.byteLength) * 100)}% saved)`,
    );
  }

  async deleteFile(caseId: string, fileId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const file = await tx.dentalLabCaseFile.findFirst({
        where: { id: fileId, caseId, deletedAt: null },
      });
      if (!file) throw new NotFoundException('file not found');
      await tx.dentalLabCaseFile.update({
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
      const dentalLabCase = await tx.dentalLabCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!dentalLabCase) throw new NotFoundException('case not found');
      return tx.dentalLabCasePhaseEvent.findMany({
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
      const dentalLabCase = await tx.dentalLabCase.findFirst({
        where: { id: caseId, deletedAt: null },
        include: { product: { select: { phases: true } } },
      });
      if (!dentalLabCase) throw new NotFoundException('case not found');
      if (dentalLabCase.labTenantId !== user.tenantId) {
        throw new ForbiddenException('only the lab can advance phases');
      }
      if (dentalLabCase.status !== DentalLabCaseStatus.IN_PROGRESS) {
        throw new BadRequestException(
          `phases only advance while case is IN_PROGRESS (current: ${dentalLabCase.status})`,
        );
      }
      const phases = dentalLabCase.product.phases;
      if (phases.length === 0) {
        throw new BadRequestException(
          'product has no phases defined — set them on the catalog product first',
        );
      }

      const open = await tx.dentalLabCasePhaseEvent.findFirst({
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
        await tx.dentalLabCasePhaseEvent.update({
          where: { id: open.id },
          data: { exitedAt: now },
        });
      }
      return tx.dentalLabCasePhaseEvent.create({
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
      const dentalLabCase = await tx.dentalLabCase.findFirst({
        where: { id: caseId, deletedAt: null, labTenantId: user.tenantId },
        select: { id: true },
      });
      if (!dentalLabCase) throw new NotFoundException('case not found');
      return tx.dentalLabCaseNote.findMany({
        where: { caseId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async createNote(caseId: string, body: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const dentalLabCase = await tx.dentalLabCase.findFirst({
        where: { id: caseId, deletedAt: null, labTenantId: user.tenantId },
        select: { id: true },
      });
      if (!dentalLabCase) throw new NotFoundException('case not found');
      return tx.dentalLabCaseNote.create({
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
      const note = await tx.dentalLabCaseNote.findFirst({
        where: { id: noteId, caseId, deletedAt: null },
      });
      if (!note) throw new NotFoundException('note not found');
      // Authors can edit their own notes; other lab users can't.
      if (note.authorUserId !== user.userId) {
        throw new ForbiddenException('only the author can edit this note');
      }
      return tx.dentalLabCaseNote.update({
        where: { id: noteId },
        data: { body },
      });
    });
  }

  async deleteNote(caseId: string, noteId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const note = await tx.dentalLabCaseNote.findFirst({
        where: { id: noteId, caseId, deletedAt: null },
      });
      if (!note) throw new NotFoundException('note not found');
      if (note.authorUserId !== user.userId) {
        throw new ForbiddenException('only the author can delete this note');
      }
      await tx.dentalLabCaseNote.update({
        where: { id: noteId },
        data: { deletedAt: new Date() },
      });
    });
  }

  // ── Per-case chat (both sides) ───────────────────────────

  async listMessages(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const dentalLabCase = await tx.dentalLabCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!dentalLabCase) throw new NotFoundException('case not found');
      return tx.dentalLabCaseMessage.findMany({
        where: { caseId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async createMessage(caseId: string, body: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const dentalLabCase = await tx.dentalLabCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!dentalLabCase) throw new NotFoundException('case not found');
      return tx.dentalLabCaseMessage.create({
        data: {
          caseId,
          body,
          senderUserId: user.userId,
          senderTenantId: user.tenantId,
        },
      });
    });
  }

  async deleteMessage(
    caseId: string,
    messageId: string,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const msg = await tx.dentalLabCaseMessage.findFirst({
        where: { id: messageId, caseId, deletedAt: null },
      });
      if (!msg) throw new NotFoundException('message not found');
      if (msg.senderUserId !== user.userId) {
        throw new ForbiddenException('only the sender can retract');
      }
      await tx.dentalLabCaseMessage.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });
    });
  }

  // ── Shipments ────────────────────────────────────────────

  async getShipment(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const dentalLabCase = await tx.dentalLabCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!dentalLabCase) throw new NotFoundException('case not found');
      return tx.dentalLabShipment.findUnique({ where: { caseId } });
    });
  }

  /** Lab-only: create or update the shipment record. */
  async upsertShipment(
    caseId: string,
    input: {
      carrier?: string | null;
      trackingNumber?: string | null;
      notes?: string | null;
    },
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const dentalLabCase = await tx.dentalLabCase.findFirst({
        where: { id: caseId, deletedAt: null, labTenantId: user.tenantId },
        select: { id: true },
      });
      if (!dentalLabCase) throw new NotFoundException('case not found');
      return tx.dentalLabShipment.upsert({
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
      const dentalLabCase = await tx.dentalLabCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true, labTenantId: true, clinicTenantId: true },
      });
      if (!dentalLabCase) throw new NotFoundException('case not found');
      if (
        dentalLabCase.labTenantId !== user.tenantId &&
        dentalLabCase.clinicTenantId !== user.tenantId
      ) {
        throw new ForbiddenException('not your case');
      }
      const ship = await tx.dentalLabShipment.findUnique({ where: { caseId } });
      if (!ship) throw new NotFoundException('no shipment yet');
      return tx.dentalLabShipment.update({
        where: { caseId },
        data: { deliveredAt: new Date() },
      });
    });
  }

  // ── Private helpers ──────────────────────────────────────

  private assertActorAllowed(
    fromStatus: DentalLabCaseStatus,
    toStatus: DentalLabCaseStatus,
    isLab: boolean,
    isClinic: boolean,
  ) {
    if (toStatus === DentalLabCaseStatus.SUBMITTED && !isClinic) {
      throw new ForbiddenException('only the clinic can submit a draft');
    }
    if (toStatus === DentalLabCaseStatus.REJECTED && !isLab) {
      throw new ForbiddenException('only the lab can reject');
    }
    const labOnly: DentalLabCaseStatus[] = [
      DentalLabCaseStatus.IN_PROGRESS,
      DentalLabCaseStatus.AWAITING_PICKUP,
      DentalLabCaseStatus.SHIPPED,
    ];
    if (labOnly.includes(toStatus) && !isLab) {
      throw new ForbiddenException(
        'only the lab can drive manufacturing transitions',
      );
    }
    void fromStatus;
  }

  private mergeUpdate(
    dto: UpdateLabCaseDto,
    existing: {
      dueAt: Date | null;
      urgency: DentalLabCaseUrgency;
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
      formData:
        dto.formData === undefined
          ? undefined
          : ((dto.formData ?? undefined) as InputJsonValue | undefined),
      patientLabel:
        dto.patientLabel === undefined
          ? existing.patientLabel
          : dto.patientLabel,
      doctorLabel:
        dto.doctorLabel === undefined ? existing.doctorLabel : dto.doctorLabel,
      deliveryCenter:
        dto.deliveryCenter === undefined
          ? existing.deliveryCenter
          : dto.deliveryCenter,
      notes: dto.notes === undefined ? existing.notes : dto.notes,
      unitPrice:
        dto.unitPrice === undefined ? existing.unitPrice : dto.unitPrice,
    };
  }
}

const OPTIMIZABLE_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function sanitizeExt(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  const ext = name.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}
