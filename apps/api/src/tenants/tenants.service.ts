import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  LabPlan,
  MemberStatus,
  Plan,
  PrismaService,
  Role,
  TenantKind,
  TenantStatus,
} from '@org/db';
import { hashPassword } from '@org/auth';
import { CreateTenantDto } from './dto/create-tenant.dto.js';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    // Public signup runs without a tenant context. Under the cliniq_app
    // role, raw inserts on `tenants` / `users` / `tenant_users` are
    // blocked by RLS (no INSERT policy exists for the app role on
    // those tables — they're only writable by platform admins). Wrap
    // the whole create in `withPlatformContext` to set
    // `app.platform_admin = '1'` for this transaction so the bypass
    // policies trip. The route is otherwise unauthenticated, but the
    // service-layer slug uniqueness check + the unique constraint on
    // `tenants.slug` prevent abuse here.
    const existing = await this.prisma.withPlatformContext((tx) =>
      tx.tenant.findUnique({ where: { slug: dto.slug } }),
    );
    if (existing) {
      throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    // Hash outside the transaction — bcrypt at cost=12 is ~250ms and we don't
    // want to hold the row lock for that long.
    const passwordHash = dto.ownerPassword
      ? await hashPassword(dto.ownerPassword)
      : null;

    const kind = dto.kind ?? TenantKind.CLINIC;
    return this.prisma.withPlatformContext(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          kind,
          // Clinic tenants get a Plan; lab tenants get a LabPlan.
          plan: kind === TenantKind.CLINIC ? (dto.plan ?? Plan.STARTER) : null,
          labPlan: kind === TenantKind.LAB ? (dto.labPlan ?? LabPlan.LAB_BASIC) : null,
          status: TenantStatus.TRIAL,
          trialEndsAt: this.addDays(new Date(), 30),
        },
      });

      // No password = new split signup flow: caller will register the owner
      // via /api/auth/register, which creates the User + TenantUser. Skip
      // owner provisioning here so we don't conflict on the unique email.
      if (!passwordHash) {
        this.logger.log(`Created tenant ${tenant.slug} (${tenant.id}) without owner — pending /auth/register`);
        return tenant;
      }

      // Upsert: existing User keeps its passwordHash (don't trample creds for
      // a user who happens to be bootstrapping a second tenant). New User
      // gets the hash from this request so the owner can immediately log in.
      const ownerUser = await tx.user.upsert({
        where: { email: dto.ownerEmail },
        update: {},
        create: { email: dto.ownerEmail, name: dto.ownerName, passwordHash },
      });

      await tx.tenantUser.create({
        data: {
          tenantId: tenant.id,
          userId: ownerUser.id,
          role: Role.OWNER,
          status: MemberStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });

      this.logger.log(`Created tenant ${tenant.slug} (${tenant.id}) with owner ${ownerUser.email}`);
      return tenant;
    });
  }

  async findBySlug(slug: string) {
    // Public lookup: clinic web app needs to resolve a slug → tenant id
    // before login. Wrap in platform context to bypass the
    // tenants_self_read RLS policy (which only lets a tenant read its
    // own row).
    const tenant = await this.prisma.withPlatformContext((tx) =>
      tx.tenant.findUnique({ where: { slug } }),
    );
    if (!tenant) throw new NotFoundException(`Tenant "${slug}" not found`);
    return tenant;
  }

  async list() {
    return this.prisma.withPlatformContext((tx) =>
      tx.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
}
