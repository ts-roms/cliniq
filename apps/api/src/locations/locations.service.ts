import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type { CreateLocationDto, UpdateLocationDto } from './dto/location.dto.js';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.location.findMany({
        where: { deletedAt: null },
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      }),
    );
  }

  /**
   * Create a location. If `isPrimary` is set, demote any existing primary in
   * the same transaction so we always have exactly one. Names must be unique
   * within a tenant — DB unique index plus a friendly conflict message here.
   */
  async create(dto: CreateLocationDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const dupe = await tx.location.findFirst({
        where: { name: dto.name, deletedAt: null },
        select: { id: true },
      });
      if (dupe) throw new BadRequestException(`A location named "${dto.name}" already exists`);

      if (dto.isPrimary) {
        await tx.location.updateMany({
          where: { isPrimary: true },
          data: { isPrimary: false },
        });
      } else {
        // First location automatically becomes primary.
        const count = await tx.location.count({ where: { deletedAt: null } });
        if (count === 0) dto.isPrimary = true;
      }

      return tx.location.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name,
          addressLine1: dto.addressLine1 ?? null,
          addressLine2: dto.addressLine2 ?? null,
          city: dto.city ?? null,
          province: dto.province ?? null,
          postalCode: dto.postalCode ?? null,
          phone: dto.phone ?? null,
          isPrimary: dto.isPrimary ?? false,
        },
      });
    });
  }

  async update(id: string, dto: UpdateLocationDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const loc = await tx.location.findFirst({ where: { id, deletedAt: null } });
      if (!loc) throw new NotFoundException(`Location ${id} not found`);

      if (dto.isPrimary && !loc.isPrimary) {
        await tx.location.updateMany({
          where: { isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.location.update({
        where: { id },
        data: {
          name: dto.name ?? loc.name,
          addressLine1: dto.addressLine1 ?? loc.addressLine1,
          addressLine2: dto.addressLine2 ?? loc.addressLine2,
          city: dto.city ?? loc.city,
          province: dto.province ?? loc.province,
          postalCode: dto.postalCode ?? loc.postalCode,
          phone: dto.phone ?? loc.phone,
          isPrimary: dto.isPrimary ?? loc.isPrimary,
          active: dto.active ?? loc.active,
        },
      });
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const loc = await tx.location.findFirst({ where: { id, deletedAt: null } });
      if (!loc) throw new NotFoundException(`Location ${id} not found`);
      if (loc.isPrimary) {
        throw new BadRequestException('Cannot delete the primary location — set another as primary first.');
      }
      await tx.location.update({
        where: { id },
        data: { deletedAt: new Date(), active: false },
      });
    });
  }
}
