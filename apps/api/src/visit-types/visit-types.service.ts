import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type {
  CreateVisitTypeDto,
  UpdateVisitTypeDto,
} from './dto/visit-type.dto.js';

/**
 * The clinic's catalogue of checkups.
 *
 * A visit type says what a patient is coming in FOR, which is a different
 * question from `AppointmentType` (the modality) and from `Service` (a price
 * list). Each one names the clinical modules it focuses, so the consult
 * screen can open the dental chart for a cleaning instead of every form the
 * product ships.
 */
@Injectable()
export class VisitTypesService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthenticatedUser, opts?: { includeInactive?: boolean }) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.visitType.findMany({
        where: {
          deletedAt: null,
          ...(opts?.includeInactive ? {} : { active: true }),
        },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async findById(id: string, user: AuthenticatedUser) {
    const found = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      (tx) => tx.visitType.findFirst({ where: { id, deletedAt: null } }),
    );
    if (!found) throw new NotFoundException('visit type not found');
    return found;
  }

  async create(dto: CreateVisitTypeDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const clash = await tx.visitType.findFirst({
        where: { name: dto.name, deletedAt: null },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(
          `a visit type named "${dto.name}" already exists`,
        );
      }
      // At most one default: staff pick from a list, and two pre-selected
      // entries is not a state the picker can represent.
      if (dto.isDefault) {
        await tx.visitType.updateMany({
          where: { isDefault: true, deletedAt: null },
          data: { isDefault: false },
        });
      }

      return tx.visitType.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name,
          code: dto.code ?? null,
          modules: dto.modules ?? [],
          isDefault: dto.isDefault ?? false,
          active: dto.active ?? true,
          sortOrder: dto.sortOrder ?? 0,
          description: dto.description ?? null,
        },
      });
    });
  }

  async update(id: string, dto: UpdateVisitTypeDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.visitType.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('visit type not found');

      if (dto.name) {
        const clash = await tx.visitType.findFirst({
          where: { name: dto.name, deletedAt: null, id: { not: id } },
          select: { id: true },
        });
        if (clash) {
          throw new ConflictException(
            `a visit type named "${dto.name}" already exists`,
          );
        }
      }
      if (dto.isDefault) {
        await tx.visitType.updateMany({
          where: { isDefault: true, deletedAt: null, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.visitType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.code !== undefined ? { code: dto.code } : {}),
          ...(dto.modules !== undefined ? { modules: dto.modules } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
        },
      });
    });
  }

  /**
   * Soft delete. Appointments and consultations keep their FK (ON DELETE SET
   * NULL never fires) so historical records still say what the visit was for.
   */
  async remove(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.visitType.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('visit type not found');
      await tx.visitType.update({
        where: { id },
        data: { deletedAt: new Date(), active: false, isDefault: false },
      });
      return { id, deleted: true };
    });
  }

}
