import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DelegationStatus, MemberStatus, PrismaService, Role } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type { CreateDelegationDto } from './dto/delegation.dto.js';

@Injectable()
export class DelegationsService {
  private readonly logger = new Logger(DelegationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Doctor grants authority to a co-worker. Validates:
   *   - delegatee exists and is an active member of the same tenant
   *   - delegator != delegatee
   *   - end > start, end > now (no creating already-expired delegations)
   *   - delegator is a clinical role (DOCTOR/OWNER/ADMIN/NURSE) — only those
   *     have authority worth delegating
   */
  async create(dto: CreateDelegationDto, user: AuthenticatedUser) {
    if (dto.delegateeId === user.userId) {
      throw new BadRequestException('cannot delegate to yourself');
    }
    if (dto.endsAt <= dto.startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    if (dto.endsAt.getTime() <= Date.now()) {
      throw new BadRequestException('endsAt must be in the future');
    }
    if (!CLINICAL_DELEGATORS.has(user.role)) {
      throw new ForbiddenException(`role ${user.role} cannot grant delegations`);
    }

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const delegatee = await tx.tenantUser.findFirst({
        where: {
          userId: dto.delegateeId,
          tenantId: user.tenantId,
          status: MemberStatus.ACTIVE,
        },
        select: { userId: true, role: true },
      });
      if (!delegatee) {
        throw new BadRequestException('delegatee is not a member of this tenant');
      }

      return tx.delegation.create({
        data: {
          tenantId: user.tenantId,
          delegatorId: user.userId,
          delegateeId: dto.delegateeId,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          reason: dto.reason ?? null,
          scope: dto.scope ?? [],
          status: DelegationStatus.ACTIVE,
        },
      });
    });
  }

  /** Delegations the current user has GRANTED to others. */
  async listGranted(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.delegation.findMany({
        where: { delegatorId: user.userId },
        orderBy: [{ status: 'asc' }, { endsAt: 'desc' }],
        include: {
          delegatee: { select: { id: true, name: true, email: true } },
        },
      }),
    );
  }

  /**
   * Delegations the current user can ACT UNDER right now (received + active +
   * within window). UI uses this to populate the "Acting as" picker.
   */
  async listReceivedActive(user: AuthenticatedUser) {
    const now = new Date();
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.delegation.findMany({
        where: {
          delegateeId: user.userId,
          status: DelegationStatus.ACTIVE,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        orderBy: { endsAt: 'asc' },
        include: {
          delegator: { select: { id: true, name: true, email: true } },
        },
      }),
    );
  }

  async revoke(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const d = await tx.delegation.findFirst({ where: { id } });
      if (!d) throw new NotFoundException(`Delegation ${id} not found`);
      if (d.status !== DelegationStatus.ACTIVE) {
        throw new BadRequestException('delegation is not active');
      }
      const isAdmin = user.role === Role.OWNER || user.role === Role.ADMIN;
      if (d.delegatorId !== user.userId && !isAdmin) {
        throw new ForbiddenException('only the delegator or an admin can revoke');
      }
      return tx.delegation.update({
        where: { id },
        data: {
          status: DelegationStatus.REVOKED,
          revokedAt: new Date(),
          revokedById: user.userId,
        },
      });
    });
  }

  /**
   * Staff members in the current tenant the caller could delegate to —
   * everyone except themselves and patients. Excludes inactive members.
   */
  async listEligibleDelegatees(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const members = await tx.tenantUser.findMany({
        where: {
          tenantId: user.tenantId,
          status: MemberStatus.ACTIVE,
          role: { not: Role.PATIENT },
          userId: { not: user.userId },
        },
        select: {
          role: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { role: 'asc' },
      });
      return members.map((m) => ({ ...m.user, role: m.role }));
    });
  }

  /**
   * Look up an active delegation for the (delegatorId → delegateeId) pair
   * right now. Returns null if no valid delegation exists. Used by the
   * X-Acting-For middleware to validate every request.
   */
  async findActiveDelegation(
    tenantId: string,
    delegatorId: string,
    delegateeId: string,
  ) {
    const now = new Date();
    return this.prisma.withTenant(tenantId, delegateeId, (tx) =>
      tx.delegation.findFirst({
        where: {
          delegatorId,
          delegateeId,
          status: DelegationStatus.ACTIVE,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: { id: true, scope: true, endsAt: true },
      }),
    );
  }
}

const CLINICAL_DELEGATORS = new Set<Role>([Role.OWNER, Role.ADMIN, Role.DOCTOR, Role.NURSE]);
