import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LabMaterialLotStatus, PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import type {
  CreateLotDto,
  CreateMaterialDto,
  RecordUsageDto,
  UpdateLotDto,
  UpdateMaterialDto,
} from './dto/material.dto.js';

@Injectable()
export class LabMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Materials ────────────────────────────────────────────

  async listMaterials(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labMaterial.findMany({
        where: { tenantId: user.tenantId, deletedAt: null },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        include: {
          lots: {
            where: { deletedAt: null },
            select: { id: true, status: true, remainingQty: true },
          },
        },
      }),
    );
  }

  async createMaterial(dto: CreateMaterialDto, user: AuthenticatedUser) {
    await this.requireLab(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      try {
        return await tx.labMaterial.create({
          data: {
            tenantId: user.tenantId,
            name: dto.name,
            sku: dto.sku ?? null,
            category: dto.category ?? null,
            unitOfMeasure: dto.unitOfMeasure ?? 'g',
            description: dto.description ?? null,
            defaultSupplier: dto.defaultSupplier ?? null,
          },
        });
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          throw new ConflictException(`SKU "${dto.sku}" already exists`);
        }
        throw err;
      }
    });
  }

  async updateMaterial(id: string, dto: UpdateMaterialDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.labMaterial.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('material not found');
      return tx.labMaterial.update({
        where: { id },
        data: {
          name: dto.name ?? existing.name,
          sku: dto.sku === undefined ? existing.sku : dto.sku,
          category: dto.category === undefined ? existing.category : dto.category,
          unitOfMeasure: dto.unitOfMeasure ?? existing.unitOfMeasure,
          description: dto.description === undefined ? existing.description : dto.description,
          defaultSupplier:
            dto.defaultSupplier === undefined ? existing.defaultSupplier : dto.defaultSupplier,
        },
      });
    });
  }

  async removeMaterial(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.labMaterial.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('material not found');
      await tx.labMaterial.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  // ── LOTs ─────────────────────────────────────────────────

  async listLots(materialId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const material = await tx.labMaterial.findFirst({
        where: { id: materialId, deletedAt: null },
        select: { id: true },
      });
      if (!material) throw new NotFoundException('material not found');
      return tx.labMaterialLot.findMany({
        where: { materialId, deletedAt: null },
        orderBy: [{ status: 'asc' }, { receivedAt: 'desc' }],
      });
    });
  }

  async createLot(materialId: string, dto: CreateLotDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const material = await tx.labMaterial.findFirst({
        where: { id: materialId, deletedAt: null },
        select: { id: true },
      });
      if (!material) throw new NotFoundException('material not found');
      try {
        return await tx.labMaterialLot.create({
          data: {
            materialId,
            lotNumber: dto.lotNumber,
            manufacturer: dto.manufacturer ?? null,
            supplier: dto.supplier ?? null,
            initialQty: dto.initialQty,
            remainingQty: dto.initialQty,
            unitPriceCents: dto.unitPriceCents ?? null,
            receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            status: dto.status ?? LabMaterialLotStatus.ACTIVE,
            notes: dto.notes ?? null,
          },
        });
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          throw new ConflictException(
            `LOT "${dto.lotNumber}" already exists on this material`,
          );
        }
        throw err;
      }
    });
  }

  async updateLot(lotId: string, dto: UpdateLotDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const lot = await tx.labMaterialLot.findFirst({
        where: { id: lotId, deletedAt: null },
      });
      if (!lot) throw new NotFoundException('LOT not found');
      return tx.labMaterialLot.update({
        where: { id: lotId },
        data: {
          status: dto.status ?? lot.status,
          expiresAt:
            dto.expiresAt === undefined
              ? lot.expiresAt
              : dto.expiresAt === null
                ? null
                : new Date(dto.expiresAt),
          notes: dto.notes === undefined ? lot.notes : dto.notes,
        },
      });
    });
  }

  async removeLot(lotId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const lot = await tx.labMaterialLot.findFirst({
        where: { id: lotId, deletedAt: null },
      });
      if (!lot) throw new NotFoundException('LOT not found');
      // Block hard removal if usages exist; soft-delete instead.
      await tx.labMaterialLot.update({
        where: { id: lotId },
        data: { deletedAt: new Date() },
      });
    });
  }

  // ── Usage on cases ───────────────────────────────────────

  async listUsages(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return tx.labMaterialUsage.findMany({
        where: { caseId },
        orderBy: { usedAt: 'desc' },
        include: {
          lot: {
            include: { material: true },
          },
        },
      });
    });
  }

  async recordUsage(caseId: string, dto: RecordUsageDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null, labTenantId: user.tenantId },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      const lot = await tx.labMaterialLot.findFirst({
        where: { id: dto.lotId, deletedAt: null },
        include: { material: { select: { tenantId: true } } },
      });
      if (!lot) throw new NotFoundException('LOT not found');
      if (lot.material.tenantId !== user.tenantId) {
        throw new ForbiddenException('LOT belongs to another lab');
      }
      if (lot.status !== LabMaterialLotStatus.ACTIVE) {
        throw new BadRequestException(`cannot use LOT in ${lot.status} status`);
      }
      if (lot.remainingQty < dto.qty) {
        throw new BadRequestException(
          `LOT only has ${lot.remainingQty} ${lot.material.tenantId} left`,
        );
      }
      // Decrement remaining, flip to FINISHED if depleted.
      const nextRemaining = lot.remainingQty - dto.qty;
      await tx.labMaterialLot.update({
        where: { id: lot.id },
        data: {
          remainingQty: nextRemaining,
          status:
            nextRemaining <= 0 ? LabMaterialLotStatus.FINISHED : lot.status,
        },
      });
      return tx.labMaterialUsage.create({
        data: {
          caseId,
          lotId: lot.id,
          qty: dto.qty,
          usedByUserId: user.userId,
        },
      });
    });
  }

  async deleteUsage(caseId: string, usageId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const usage = await tx.labMaterialUsage.findFirst({
        where: { id: usageId, caseId },
        include: { lot: true },
      });
      if (!usage) throw new NotFoundException('usage not found');
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, labTenantId: user.tenantId },
        select: { id: true },
      });
      if (!labCase) throw new ForbiddenException('not your case');
      // Restore quantity to the LOT and re-activate if it was depleted.
      await tx.labMaterialLot.update({
        where: { id: usage.lotId },
        data: {
          remainingQty: { increment: usage.qty },
          status:
            usage.lot.status === LabMaterialLotStatus.FINISHED
              ? LabMaterialLotStatus.ACTIVE
              : usage.lot.status,
        },
      });
      await tx.labMaterialUsage.delete({ where: { id: usageId } });
    });
  }

  private async requireLab(user: AuthenticatedUser) {
    const t = await this.prisma.getTenantContext(user.tenantId);
    if (!t || t.kind !== 'LAB') {
      throw new ForbiddenException('only LAB tenants can manage materials');
    }
  }
}
