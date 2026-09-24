import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  SpecimenRejectionReason,
  SpecimenStatus,
  type PrismaClient,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  accessionPeriod,
  allowedSpecimenTransitions,
  canTransitionSpecimen,
  formatAccessionNumber,
  nextSequenceValue,
} from './accession.js';
import type {
  CollectSpecimenDto,
  ReceiveSpecimenDto,
  RejectSpecimenDto,
} from './dto/specimens.dto.js';

/**
 * Specimen handling: collection, accessioning, reception, rejection.
 *
 * This is where a laboratory workflow actually starts. Before it, an order
 * carried three nullable timestamps and no notion of a tube — so "who drew
 * this", "what container", "which of the two specimens produced this result"
 * and "why was it rejected" were all unanswerable.
 */
@Injectable()
export class SpecimensService {
  private readonly logger = new Logger(SpecimensService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Collect a specimen against an order and give it an accession number.
   *
   * The accession is allocated atomically (see ./accession.ts) so two
   * phlebotomists drawing at the same moment cannot be handed the same
   * number. From here on the accession — not the order — is what identifies
   * the sample.
   *
   * `itemIds` splits an order across tubes: an order needing EDTA and serum
   * produces two specimens, each carrying the tests it can actually run.
   * Omitting it attaches every item that has not been assigned yet, which is
   * the common single-tube case.
   */
  async collect(
    orderId: string,
    dto: CollectSpecimenDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const order = await tx.labOrder.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
          items: { select: { id: true, specimenId: true, testId: true } },
        },
      });
      if (!order) throw new NotFoundException(`Lab order ${orderId} not found`);
      if (order.status === 'CANCELLED') {
        throw new BadRequestException(
          'cannot collect against a cancelled order',
        );
      }

      const unassigned = order.items.filter((i) => i.specimenId === null);
      let itemIds: string[];
      if (dto.itemIds && dto.itemIds.length > 0) {
        const known = new Set(order.items.map((i) => i.id));
        const unknown = dto.itemIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          throw new BadRequestException(
            `items not on this order: ${unknown.join(', ')}`,
          );
        }
        const taken = order.items.filter(
          (i) => dto.itemIds?.includes(i.id) && i.specimenId !== null,
        );
        if (taken.length > 0) {
          throw new BadRequestException(
            `items already collected onto another specimen: ${taken
              .map((i) => i.id)
              .join(', ')}`,
          );
        }
        itemIds = dto.itemIds;
      } else {
        if (unassigned.length === 0) {
          throw new BadRequestException(
            'every item on this order is already on a specimen; pass itemIds to split explicitly',
          );
        }
        itemIds = unassigned.map((i) => i.id);
      }

      const now = new Date();
      const value = await nextSequenceValue(
        tx,
        user.tenantId,
        'ACCESSION',
        accessionPeriod(now),
      );
      const accessionNumber = formatAccessionNumber(now, value);

      const specimen = await tx.specimen.create({
        data: {
          tenantId: user.tenantId,
          accessionNumber,
          orderId,
          patientId: order.patientId,
          specimenType: dto.specimenType ?? null,
          container: dto.container ?? null,
          volumeMl: dto.volumeMl ?? null,
          collectionSite: dto.collectionSite ?? null,
          collectedAt: dto.collectedAt ?? now,
          collectedById: user.userId,
          status: SpecimenStatus.COLLECTED,
        },
      });

      await tx.labOrderItem.updateMany({
        where: { id: { in: itemIds } },
        data: { specimenId: specimen.id },
      });

      // The order tracks the FIRST collection; per-tube times live on the
      // specimens, which is where they belong once an order can have several.
      if (!order.collectedAt) {
        await tx.labOrder.update({
          where: { id: orderId },
          data: { status: 'COLLECTED', collectedAt: specimen.collectedAt },
        });
      }

      this.logger.log(
        `accession ${accessionNumber} collected for order ${order.number} (${itemIds.length} items)`,
      );
      return tx.specimen.findFirst({
        where: { id: specimen.id },
        include: { items: { select: { id: true, testName: true } } },
      });
    });
  }

  /** The bench worklist. Oldest first, because that is the order to work in. */
  list(
    user: AuthenticatedUser,
    opts: { status?: SpecimenStatus; orderId?: string } = {},
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.specimen.findMany({
        where: {
          ...(opts.status ? { status: opts.status } : {}),
          ...(opts.orderId ? { orderId: opts.orderId } : {}),
        },
        include: {
          items: { select: { id: true, testName: true, testCode: true } },
          rejections: { orderBy: { rejectedAt: 'desc' } },
        },
        orderBy: [{ createdAt: 'asc' }],
        take: 200,
      }),
    );
  }

  async detail(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const specimen = await tx.specimen.findFirst({
        where: { id },
        include: {
          items: { select: { id: true, testName: true, testCode: true } },
          rejections: { orderBy: { rejectedAt: 'desc' } },
        },
      });
      if (!specimen) throw new NotFoundException(`Specimen ${id} not found`);
      return specimen;
    });
  }

  /** Receive a specimen at the bench. */
  async receive(id: string, dto: ReceiveSpecimenDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const specimen = await this.requireTransition(
        tx,
        id,
        SpecimenStatus.RECEIVED,
      );
      const receivedAt = dto.receivedAt ?? new Date();
      if (specimen.collectedAt && receivedAt < specimen.collectedAt) {
        throw new BadRequestException(
          'receivedAt is before collectedAt — check the times',
        );
      }
      return tx.specimen.update({
        where: { id },
        data: {
          status: SpecimenStatus.RECEIVED,
          receivedAt,
          receivedById: user.userId,
          storageLocation: dto.storageLocation ?? specimen.storageLocation,
        },
      });
    });
  }

  /**
   * Reject a specimen.
   *
   * Terminal: the replacement is a NEW specimen with its own accession
   * number, because a re-draw is a different tube and reusing the number
   * would conflate two draws under one identity. The rejection row is
   * append-only — a tube rejected twice has two rows.
   */
  async reject(id: string, dto: RejectSpecimenDto, user: AuthenticatedUser) {
    // "OTHER" with no explanation is not a reason — the next person reading
    // the rejection has to know why the tube was thrown away. There is a
    // CHECK constraint behind this, but a constraint violation surfaces as a
    // 500; the caller deserves a 400 that says what to fix.
    if (dto.reason === SpecimenRejectionReason.OTHER && !dto.remarks?.trim()) {
      throw new BadRequestException(
        'remarks are required when the rejection reason is OTHER',
      );
    }
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      await this.requireTransition(tx, id, SpecimenStatus.REJECTED);

      await tx.specimenRejection.create({
        data: {
          tenantId: user.tenantId,
          specimenId: id,
          reason: dto.reason,
          remarks: dto.remarks ?? null,
          rejectedById: user.userId,
        },
      });

      // Release the tests so they can be re-collected onto a new tube
      // instead of being stranded on a specimen nobody can run.
      await tx.labOrderItem.updateMany({
        where: { specimenId: id },
        data: { specimenId: null },
      });

      this.logger.warn(`specimen ${id} rejected: ${dto.reason}`);
      return tx.specimen.update({
        where: { id },
        data: { status: SpecimenStatus.REJECTED },
        include: { rejections: { orderBy: { rejectedAt: 'desc' } } },
      });
    });
  }

  /**
   * Move a specimen to any other state the machine allows — PROCESSING,
   * COMPLETED, CANCELLED, REFERRED. Collection, reception and rejection have
   * their own routes because each records more than a status.
   */
  async transition(id: string, to: SpecimenStatus, user: AuthenticatedUser) {
    if (
      to === SpecimenStatus.COLLECTED ||
      to === SpecimenStatus.RECEIVED ||
      to === SpecimenStatus.REJECTED
    ) {
      throw new BadRequestException(
        `use the dedicated route for ${to} — it records more than a status`,
      );
    }
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      await this.requireTransition(tx, id, to);
      return tx.specimen.update({ where: { id }, data: { status: to } });
    });
  }

  /** Load a specimen and assert the requested move is legal. */
  private async requireTransition(
    tx: PrismaClient,
    id: string,
    to: SpecimenStatus,
  ) {
    const specimen = await tx.specimen.findFirst({ where: { id } });
    if (!specimen) throw new NotFoundException(`Specimen ${id} not found`);
    if (!canTransitionSpecimen(specimen.status, to)) {
      const allowed = allowedSpecimenTransitions(specimen.status);
      throw new BadRequestException(
        allowed.length === 0
          ? `specimen is ${specimen.status}, which is terminal`
          : `cannot move a ${specimen.status} specimen to ${to}; allowed: ${allowed.join(', ')}`,
      );
    }
    return specimen;
  }
}
