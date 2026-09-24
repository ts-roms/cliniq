import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { normaliseTestKey } from './flagging.js';
import type {
  CreateCriticalValueRuleDto,
  UpdateCriticalValueRuleDto,
} from './dto/critical-value-rules.dto.js';

/**
 * The laboratory's configured critical limits.
 *
 * These are the only source of CRITICAL_HIGH / CRITICAL_LOW. Nothing derives
 * them — see the header of ./flagging.ts for why the previous arithmetic was
 * a patient-safety defect.
 */
@Injectable()
export class CriticalValueRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthenticatedUser, opts: { includeExpired?: boolean } = {}) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.criticalValueRule.findMany({
        where: {
          deletedAt: null,
          ...(opts.includeExpired
            ? {}
            : {
                OR: [
                  { effectiveTo: null },
                  { effectiveTo: { gt: new Date() } },
                ],
              }),
        },
        orderBy: [{ testKey: 'asc' }, { effectiveFrom: 'desc' }],
        take: 500,
      }),
    );
  }

  async create(dto: CreateCriticalValueRuleDto, user: AuthenticatedUser) {
    const testKey = normaliseTestKey(dto.test);
    if (testKey === '') {
      throw new BadRequestException('test must contain a usable identifier');
    }
    // The DB enforces both of these too; checking here turns a 500 from a
    // constraint violation into a 400 that says which field is wrong.
    if (dto.criticalLow === undefined && dto.criticalHigh === undefined) {
      throw new BadRequestException(
        'set criticalLow, criticalHigh, or both — a rule with neither would never fire',
      );
    }
    if (
      dto.criticalLow !== undefined &&
      dto.criticalHigh !== undefined &&
      dto.criticalLow >= dto.criticalHigh
    ) {
      throw new BadRequestException('criticalLow must be below criticalHigh');
    }
    if (
      dto.ageMinDays !== undefined &&
      dto.ageMaxDays !== undefined &&
      dto.ageMinDays >= dto.ageMaxDays
    ) {
      throw new BadRequestException('ageMinDays must be below ageMaxDays');
    }

    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.criticalValueRule.create({
        data: {
          tenantId: user.tenantId,
          testKey,
          label: dto.label,
          unit: dto.unit ?? null,
          criticalLow: dto.criticalLow ?? null,
          criticalHigh: dto.criticalHigh ?? null,
          ageMinDays: dto.ageMinDays ?? null,
          ageMaxDays: dto.ageMaxDays ?? null,
          sex: dto.sex ?? null,
          note: dto.note ?? null,
          ...(dto.notifyWithinMinutes !== undefined
            ? { notifyWithinMinutes: dto.notifyWithinMinutes }
            : {}),
          effectiveFrom: dto.effectiveFrom ?? new Date(),
          createdById: user.userId,
        },
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateCriticalValueRuleDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.criticalValueRule.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException(`Critical value rule ${id} not found`);
      }
      if (
        dto.effectiveTo !== undefined &&
        dto.effectiveTo.getTime() <= existing.effectiveFrom.getTime()
      ) {
        throw new BadRequestException(
          'effectiveTo must be after effectiveFrom',
        );
      }
      return tx.criticalValueRule.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          ...(dto.effectiveTo !== undefined
            ? { effectiveTo: dto.effectiveTo }
            : {}),
        },
      });
    });
  }

  /**
   * Retire a rule.
   *
   * Soft delete, never a hard one: a rule is the explanation for how a result
   * was flagged, so it has to remain readable after it stops applying.
   */
  async retire(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.criticalValueRule.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException(`Critical value rule ${id} not found`);
      }
      const now = new Date();
      return tx.criticalValueRule.update({
        where: { id },
        data: {
          deletedAt: now,
          // Close the window too, so a rule retired mid-life stops applying
          // at retirement rather than reading as open-ended in history.
          effectiveTo:
            existing.effectiveTo ??
            (existing.effectiveFrom.getTime() < now.getTime()
              ? now
              : existing.effectiveFrom),
        },
      });
    });
  }
}
