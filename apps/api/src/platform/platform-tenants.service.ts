import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MemberStatus,
  Plan,
  PrismaService,
  Role as DbRole,
  TenantStatus,
} from '@org/db';
import { hashPassword } from '@org/auth';
import {
  ALL_LAB_PLANS,
  ALL_PLANS,
  LAB_PLAN_META,
  PLAN_META,
  type LabPlan as LabPlanT,
  type Plan as PlanT,
} from '@org/shared-types';
import type { PlatformCreateTenantDto, PlatformUpdateTenantDto } from './dto/update-tenant.dto.js';

export interface ListTenantsQuery {
  search?: string;
  status?: TenantStatus;
  plan?: Plan;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class PlatformTenantsService {
  private readonly logger = new Logger(PlatformTenantsService.name);
  private static readonly DEFAULT_LIMIT = 25;
  private static readonly MAX_LIMIT = 100;

  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListTenantsQuery) {
    const limit = Math.min(q.limit ?? PlatformTenantsService.DEFAULT_LIMIT, PlatformTenantsService.MAX_LIMIT);
    const where = {
      deletedAt: null,
      ...(q.search
        ? {
            OR: [
              { slug: { contains: q.search, mode: 'insensitive' as const } },
              { name: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.plan ? { plan: q.plan } : {}),
    };

    const items = await this.prisma.withPlatformContext((tx) =>
      tx.tenant.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          slug: true,
          name: true,
          type: true,
          status: true,
          plan: true,
          country: true,
          timezone: true,
          currency: true,
          trialEndsAt: true,
          createdAt: true,
          _count: {
            select: { users: true, locations: true, patients: true },
          },
        },
      }),
    );

    const hasMore = items.length > limit;
    const slice = hasMore ? items.slice(0, limit) : items;
    return {
      items: slice.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        type: t.type,
        status: t.status,
        plan: t.plan,
        country: t.country,
        timezone: t.timezone,
        currency: t.currency,
        trialEndsAt: t.trialEndsAt,
        createdAt: t.createdAt,
        userCount: t._count.users,
        locationCount: t._count.locations,
        patientCount: t._count.patients,
      })),
      nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null,
    };
  }

  async findById(id: string) {
    const t = await this.prisma.withPlatformContext((tx) =>
      tx.tenant.findUnique({
        where: { id },
        include: {
          _count: {
            select: { users: true, locations: true, patients: true },
          },
        },
      }),
    );
    if (!t || t.deletedAt) throw new NotFoundException('tenant not found');
    // Resolve the right plan meta based on tenant kind. Clinic tenants have
    // `plan`; lab tenants have `labPlan`. Either may legitimately be null
    // during a transitional state (e.g. cancelled subscription).
    const planMeta =
      t.kind === 'LAB'
        ? (t.labPlan ? LAB_PLAN_META[t.labPlan as LabPlanT] : null)
        : (t.plan ? PLAN_META[t.plan as PlanT] : null);
    return {
      ...t,
      userCount: t._count.users,
      locationCount: t._count.locations,
      patientCount: t._count.patients,
      planMeta,
    };
  }

  async update(id: string, dto: PlatformUpdateTenantDto, adminId: string, adminEmail: string) {
    const { updated, before } = await this.prisma.withPlatformContext(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) throw new NotFoundException('tenant not found');

      const next = await tx.tenant.update({
        where: { id },
        data: {
          ...(dto.plan ? { plan: dto.plan } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.trialEndsAt !== undefined
            ? { trialEndsAt: dto.trialEndsAt === null ? null : new Date(dto.trialEndsAt) }
            : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: id,
          userId: null,
          actorEmail: adminEmail,
          action: 'platform.tenant.update',
          entityType: 'Tenant',
          entityId: id,
          metadata: {
            adminId,
            slug: existing.slug,
            changes: dto as object,
            before: {
              plan: existing.plan,
              status: existing.status,
              trialEndsAt: existing.trialEndsAt,
              name: existing.name,
            },
          },
        },
      });

      return { updated: next, before: existing };
    });

    this.logger.log(
      `Platform admin ${adminId} updated tenant ${id} (slug=${before.slug}): ` +
        Object.entries(dto)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(' '),
    );

    return updated;
  }

  async create(dto: PlatformCreateTenantDto, adminId: string, adminEmail: string) {
    const slug = dto.slug.toLowerCase();
    const plan = dto.plan ?? Plan.STARTER;

    if (dto.ownerEmail && !dto.ownerPassword) {
      throw new BadRequestException('ownerPassword is required when ownerEmail is set');
    }

    const result = await this.prisma.withPlatformContext(async (tx) => {
      const conflict = await tx.tenant.findUnique({ where: { slug } });
      if (conflict) throw new ConflictException(`tenant slug "${slug}" already exists`);

      const tenant = await tx.tenant.create({
        data: {
          slug,
          name: dto.name,
          type: dto.type ?? undefined,
          plan,
          status: TenantStatus.TRIAL,
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      if (dto.ownerEmail && dto.ownerPassword) {
        const existingUser = await tx.user.findUnique({ where: { email: dto.ownerEmail } });
        if (existingUser) {
          // Link, don't recreate. Cross-tenant memberships are allowed.
          await tx.tenantUser.create({
            data: {
              tenantId: tenant.id,
              userId: existingUser.id,
              role: DbRole.OWNER,
              status: MemberStatus.ACTIVE,
              joinedAt: new Date(),
            },
          });
        } else {
          const passwordHash = await hashPassword(dto.ownerPassword);
          const owner = await tx.user.create({
            data: {
              email: dto.ownerEmail,
              name: dto.ownerName ?? dto.ownerEmail,
              passwordHash,
            },
          });
          await tx.tenantUser.create({
            data: {
              tenantId: tenant.id,
              userId: owner.id,
              role: DbRole.OWNER,
              status: MemberStatus.ACTIVE,
              joinedAt: new Date(),
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: null,
          actorEmail: adminEmail,
          action: 'platform.tenant.create',
          entityType: 'Tenant',
          entityId: tenant.id,
          metadata: {
            adminId,
            slug,
            plan,
            ownerEmail: dto.ownerEmail ?? null,
          },
        },
      });

      return tenant;
    });

    this.logger.log(
      `Platform admin ${adminId} created tenant ${result.id} (slug=${slug}, plan=${plan})`,
    );

    return result;
  }

  /** Plan catalog for the platform admin UI (drop-down + tooltip metadata). */
  catalog() {
    return {
      clinicPlans: ALL_PLANS.map((id) => PLAN_META[id]),
      labPlans: ALL_LAB_PLANS.map((id) => LAB_PLAN_META[id]),
    };
  }
}
