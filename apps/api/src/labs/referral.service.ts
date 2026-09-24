import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, ReferralStatus, type PrismaClient } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  allowedReferralTransitions,
  canReferTo,
  canTransitionReferral,
  type ReferralStatus as ReferralStatusName,
} from './referral.js';
import type {
  MarkReferralDto,
  UpsertReferralLaboratoryDto,
} from './dto/referral.dto.js';

/**
 * Referral laboratories and the tests sent to them.
 *
 * AO 2021-0037 permits referral only to a licensed laboratory, and requires
 * the report to state which tests were referred and to which. Both are
 * enforced here rather than left to the person at the bench.
 */
@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── destinations ──────────────────────────────────

  list(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.referralLaboratory.findMany({
        where: { deletedAt: null },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
    );
  }

  async upsertLaboratory(
    dto: UpsertReferralLaboratoryDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.referralLaboratory.findFirst({
        where: { name: dto.name, deletedAt: null },
      });
      const data = {
        name: dto.name,
        dohLtoNumber: dto.dohLtoNumber ?? null,
        contactPerson: dto.contactPerson ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        address: dto.address ?? null,
        courier: dto.courier ?? null,
        isActive: dto.isActive ?? true,
      };
      if (existing) {
        return tx.referralLaboratory.update({
          where: { id: existing.id },
          data,
        });
      }
      return tx.referralLaboratory.create({
        data: { tenantId: user.tenantId, ...data },
      });
    });
  }

  /**
   * Retire a destination.
   *
   * Soft-deleted, never removed: referrals point at it, and the record of
   * where a specimen went has to stay explicable. The foreign key is
   * RESTRICT for the same reason.
   */
  async removeLaboratory(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.referralLaboratory.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException(`Referral laboratory ${id} not found`);
      }
      await tx.referralLaboratory.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
    });
  }

  // ── referrals ─────────────────────────────────────

  /** The send-out worklist: what is waiting to go, and what is out. */
  listReferrals(
    user: AuthenticatedUser,
    opts: { status?: ReferralStatus } = {},
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labReferral.findMany({
        where: opts.status ? { status: opts.status } : {},
        include: {
          laboratory: { select: { name: true, dohLtoNumber: true } },
          item: { select: { testName: true, testCode: true, orderId: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        take: 200,
      }),
    );
  }

  /**
   * Create a referral for an item, inside the caller's transaction.
   *
   * Used by order placement, where an out-of-scope test with a standing
   * destination is referred automatically. Returns null when the
   * destination is unusable, because an order must not fail on the strength
   * of a misconfigured send-out arrangement — the item is reported as
   * out-of-scope instead, which is what would have happened anyway.
   */
  async createForItem(
    tx: PrismaClient,
    tenantId: string,
    orderItemId: string,
    referralLaboratoryId: string,
  ) {
    const lab = await tx.referralLaboratory.findFirst({
      where: { id: referralLaboratoryId, deletedAt: null },
    });
    if (!lab) return null;

    const verdict = canReferTo(lab);
    if (!verdict.ok) {
      this.logger.warn(
        `cannot refer to ${lab.name}: ${verdict.reason} — item ${orderItemId} left unreferred`,
      );
      return null;
    }
    return tx.labReferral.create({
      data: { tenantId, orderItemId, referralLaboratoryId },
    });
  }

  /** Record that the specimen has gone, or come back. */
  async mark(
    id: string,
    to: ReferralStatus,
    dto: MarkReferralDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const referral = await tx.labReferral.findFirst({ where: { id } });
      if (!referral) throw new NotFoundException(`Referral ${id} not found`);

      if (
        !canTransitionReferral(
          referral.status as ReferralStatusName,
          to as ReferralStatusName,
        )
      ) {
        const allowed = allowedReferralTransitions(
          referral.status as ReferralStatusName,
        );
        throw new BadRequestException(
          allowed.length === 0
            ? `this referral is ${referral.status}, which is terminal`
            : `cannot move a ${referral.status} referral to ${to}; allowed: ${allowed.join(', ')}`,
        );
      }

      const now = new Date();
      if (to === ReferralStatus.RECEIVED && referral.sentAt) {
        const receivedAt = dto.at ?? now;
        if (receivedAt < referral.sentAt) {
          throw new BadRequestException(
            'receivedAt is before the specimen was sent — check the times',
          );
        }
      }

      return tx.labReferral.update({
        where: { id },
        data: {
          status: to,
          externalRef: dto.externalRef ?? referral.externalRef,
          notes: dto.notes ?? referral.notes,
          ...(to === ReferralStatus.SENT
            ? {
                sentAt: dto.at ?? now,
                sentById: user.userId,
                courier: dto.courier ?? referral.courier,
              }
            : {}),
          ...(to === ReferralStatus.RECEIVED
            ? {
                receivedAt: dto.at ?? now,
                conditionOnArrival:
                  dto.conditionOnArrival ?? referral.conditionOnArrival,
              }
            : {}),
        },
        include: {
          laboratory: { select: { name: true, dohLtoNumber: true } },
        },
      });
    });
  }
}
