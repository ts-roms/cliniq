import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService, Plan, Role, MemberStatus, TenantStatus } from '@org/db';
import { hashPassword } from '@org/auth';
import { CreateTenantDto } from './dto/create-tenant.dto.js';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    // Hash outside the transaction — bcrypt at cost=12 is ~250ms and we don't
    // want to hold the row lock for that long.
    const passwordHash = await hashPassword(dto.ownerPassword);

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          plan: dto.plan ?? Plan.GOLD,
          status: TenantStatus.TRIAL,
          trialEndsAt: this.addDays(new Date(), 30),
        },
      });

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
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException(`Tenant "${slug}" not found`);
    return tenant;
  }

  async list() {
    return this.prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
}
