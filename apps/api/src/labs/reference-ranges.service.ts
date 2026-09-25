import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { normaliseTestKey } from './flagging.js';
import type {
  CreateReferenceRangeDto,
  UpdateReferenceRangeDto,
} from './dto/reference-ranges.dto.js';

/**
 * The laboratory's configured reference intervals.
 *
 * Gap analysis §6.5. Before this, the interval lived as two nullable floats on
 * the order item, copied from whatever the orderer typed — so a paediatric
 * haemoglobin and an adult male haemoglobin were flagged against the same
 * numbers.
 *
 * Mirrors CriticalValueRulesService deliberately, down to the retire
 * semantics: the two kinds of configured limit are read together on every
 * result, and a reader of one should not have to learn a second set of rules
 * to understand the other.
 */
@Injectable()
export class ReferenceRangesService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthenticatedUser, opts: { includeExpired?: boolean } = {}) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.referenceRange.findMany({
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

  async create(dto: CreateReferenceRangeDto, user: AuthenticatedUser) {
    const testKey = normaliseTestKey(dto.test);
    if (testKey === '') {
      throw new BadRequestException('test must contain a usable identifier');
    }
    // Every check below is also a CHECK constraint. Doing them here turns a
    // 500 from a constraint violation into a 400 naming the field.
    if (
      dto.lowerLimit === undefined &&
      dto.upperLimit === undefined &&
      dto.textualRange === undefined
    ) {
      throw new BadRequestException(
        'set lowerLimit, upperLimit or textualRange — an interval with none would never flag anything',
      );
    }
    if (
      dto.lowerLimit !== undefined &&
      dto.upperLimit !== undefined &&
      dto.lowerLimit > dto.upperLimit
    ) {
      throw new BadRequestException(
        'lowerLimit must not exceed upperLimit — an inverted interval flags every result in range and nothing out of it',
      );
    }
    if (
      dto.ageMinDays !== undefined &&
      dto.ageMaxDays !== undefined &&
      dto.ageMinDays >= dto.ageMaxDays
    ) {
      throw new BadRequestException('ageMinDays must be below ageMaxDays');
    }

    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.referenceRange.create({
        data: {
          tenantId: user.tenantId,
          testKey,
          label: dto.label,
          unit: dto.unit ?? null,
          ageMinDays: dto.ageMinDays ?? null,
          ageMaxDays: dto.ageMaxDays ?? null,
          sex: dto.sex ?? null,
          lowerLimit: dto.lowerLimit ?? null,
          upperLimit: dto.upperLimit ?? null,
          textualRange: dto.textualRange ?? null,
          note: dto.note ?? null,
          effectiveFrom: dto.effectiveFrom ?? new Date(),
          createdById: user.userId,
        },
      }),
    );
  }

  /**
   * Change the label, unit, note, or when the interval stops applying.
   *
   * Not the limits and not the narrowing — see `UpdateReferenceRangeDto`. An
   * interval is the explanation for how results were flagged while it applied,
   * so editing its numbers would rewrite the reasoning behind results already
   * on charts. Superseding it is the supported route.
   */
  async update(
    id: string,
    dto: UpdateReferenceRangeDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.referenceRange.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException(`Reference range ${id} not found`);
      }
      if (
        dto.effectiveTo !== undefined &&
        dto.effectiveTo.getTime() <= existing.effectiveFrom.getTime()
      ) {
        throw new BadRequestException(
          'effectiveTo must be after effectiveFrom',
        );
      }
      return tx.referenceRange.update({
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
   * Retire an interval.
   *
   * Soft delete, never a hard one — and the table holds no DELETE for the
   * application role either. An interval explains how a result was flagged, so
   * it has to remain readable after it stops applying.
   */
  async retire(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.referenceRange.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException(`Reference range ${id} not found`);
      }
      const now = new Date();
      return tx.referenceRange.update({
        where: { id },
        data: {
          deletedAt: now,
          // Close the window too, so an interval retired mid-life stops
          // applying at retirement rather than reading as open-ended.
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
