import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationKind,
  NotificationSeverity,
  PrismaService,
  StockMovementKind,
  type PrismaClient,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type {
  AdjustStockDto,
  CreateItemDto,
  DispenseStockDto,
  ReceiveBatchDto,
  UpdateItemDto,
} from './dto/inventory.dto.js';

interface ItemBalance {
  itemId: string;
  onHand: number;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationsService,
  ) {}

  // ── Catalog ───────────────────────────────────────

  async listItems(user: AuthenticatedUser, q?: string) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const items = await tx.inventoryItem.findMany({
        where: {
          deletedAt: null,
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { sku: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        take: 200,
      });
      const balances = await this.balancesFor(tx, items.map((i) => i.id));
      const map = new Map(balances.map((b) => [b.itemId, b.onHand]));
      return items.map((i) => ({
        ...i,
        onHand: map.get(i.id) ?? 0,
        belowReorder: (map.get(i.id) ?? 0) <= i.reorderLevel,
      }));
    });
  }

  async createItem(dto: CreateItemDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.inventoryItem.findFirst({
        where: { sku: dto.sku, deletedAt: null },
      });
      if (existing) throw new ConflictException(`SKU ${dto.sku} already exists`);
      return tx.inventoryItem.create({
        data: {
          tenantId: user.tenantId,
          sku: dto.sku,
          name: dto.name,
          category: dto.category,
          unit: dto.unit ?? 'each',
          reorderLevel: dto.reorderLevel ?? 0,
          defaultPriceCentavos: dto.defaultPriceCentavos ?? 0,
          isControlled: dto.isControlled ?? false,
        },
      });
    });
  }

  async updateItem(id: string, dto: UpdateItemDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id, deletedAt: null },
      });
      if (!item) throw new NotFoundException(`Item ${id} not found`);
      return tx.inventoryItem.update({ where: { id }, data: dto });
    });
  }

  async detail(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id, deletedAt: null },
      });
      if (!item) throw new NotFoundException(`Item ${id} not found`);
      const [batches, movements] = await Promise.all([
        tx.stockBatch.findMany({
          where: { itemId: id, remainingQty: { gt: 0 } },
          orderBy: [{ expiresOn: 'asc' }, { receivedAt: 'asc' }],
        }),
        tx.stockMovement.findMany({
          where: { itemId: id },
          orderBy: { occurredAt: 'desc' },
          take: 50,
        }),
      ]);
      const onHand = batches.reduce((sum, b) => sum + b.remainingQty, 0);
      return {
        ...item,
        onHand,
        belowReorder: onHand <= item.reorderLevel,
        batches,
        movements,
      };
    });
  }

  // ── Movements ─────────────────────────────────────

  async receive(itemId: string, dto: ReceiveBatchDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: itemId, deletedAt: null },
      });
      if (!item) throw new NotFoundException(`Item ${itemId} not found`);
      const batch = await tx.stockBatch.create({
        data: {
          tenantId: user.tenantId,
          itemId,
          lotNumber: dto.lotNumber,
          expiresOn: dto.expiresOn,
          receivedQty: dto.receivedQty,
          remainingQty: dto.receivedQty,
          unitCostCentavos: dto.unitCostCentavos ?? 0,
          supplierName: dto.supplierName,
          receivedBy: user.userId,
        },
      });
      await tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          itemId,
          batchId: batch.id,
          kind: StockMovementKind.RECEIVE,
          quantity: dto.receivedQty,
          reason: dto.supplierName ? `from ${dto.supplierName}` : null,
          performedBy: user.userId,
        },
      });
      return batch;
    });
  }

  /**
   * Dispense quantity using FEFO across non-empty batches. Atomic — if total
   * available < requested, the whole transaction rolls back. Optionally tags
   * the movement(s) with prescriptionId for traceability.
   */
  async dispense(itemId: string, dto: DispenseStockDto, user: AuthenticatedUser) {
    const result = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: itemId, deletedAt: null },
      });
      if (!item) throw new NotFoundException(`Item ${itemId} not found`);

      const batches = await tx.stockBatch.findMany({
        where: { itemId, remainingQty: { gt: 0 } },
        orderBy: [{ expiresOn: 'asc' }, { receivedAt: 'asc' }],
      });
      const total = batches.reduce((sum, b) => sum + b.remainingQty, 0);
      if (total < dto.quantity) {
        throw new BadRequestException(
          `Insufficient stock: requested ${dto.quantity}, available ${total}`,
        );
      }

      let remaining = dto.quantity;
      const movements: Array<{ batchId: string; quantity: number }> = [];
      for (const b of batches) {
        if (remaining <= 0) break;
        const take = Math.min(b.remainingQty, remaining);
        await tx.stockBatch.update({
          where: { id: b.id },
          data: { remainingQty: { decrement: take } },
        });
        movements.push({ batchId: b.id, quantity: take });
        remaining -= take;
      }

      await tx.stockMovement.createMany({
        data: movements.map((m) => ({
          tenantId: user.tenantId,
          itemId,
          batchId: m.batchId,
          kind: StockMovementKind.DISPENSE,
          quantity: -m.quantity,
          reason: dto.reason ?? null,
          prescriptionId: dto.prescriptionId ?? null,
          performedBy: user.userId,
        })),
      });

      return {
        itemId,
        dispensed: dto.quantity,
        batchesUsed: movements.length,
        remainingOnHand: total - dto.quantity,
        item: { name: item.name, sku: item.sku, unit: item.unit, reorderLevel: item.reorderLevel },
        prevOnHand: total,
      };
    });

    // Fire INVENTORY_LOW when this dispense crossed (or stayed below) reorder.
    void this.maybeNotifyLowStock(user.tenantId, result.itemId, result.item, result.remainingOnHand, result.prevOnHand);

    return {
      itemId: result.itemId,
      dispensed: result.dispensed,
      batchesUsed: result.batchesUsed,
      remainingOnHand: result.remainingOnHand,
    };
  }

  /**
   * Fire an INVENTORY_LOW notification when a write crosses the reorder
   * threshold from above to ≤. Idempotent in the spirit that we only notify
   * on the *crossing* — staying below threshold without further movement
   * doesn't re-alert.
   */
  private async maybeNotifyLowStock(
    tenantId: string,
    itemId: string,
    item: { name: string; sku: string; unit: string; reorderLevel: number },
    newOnHand: number,
    prevOnHand: number,
  ): Promise<void> {
    if (item.reorderLevel <= 0) return;
    if (prevOnHand > item.reorderLevel && newOnHand <= item.reorderLevel) {
      await this.notif.notifyRoles(tenantId, ['OWNER', 'ADMIN', 'RECEPTIONIST'], {
        kind: NotificationKind.INVENTORY_LOW,
        severity:
          newOnHand === 0 ? NotificationSeverity.CRITICAL : NotificationSeverity.WARNING,
        title: `Low stock: ${item.name}`,
        body: `${newOnHand} ${item.unit} left (reorder at ${item.reorderLevel})`,
        link: `/inventory`,
        entityId: itemId,
      });
    }
  }

  /**
   * Manual adjustment (write-off, recount). Negative delta cannot exceed the
   * batch's remaining qty (or the item's total when no batchId given).
   */
  async adjust(itemId: string, dto: AdjustStockDto, user: AuthenticatedUser) {
    if (dto.delta === 0) throw new BadRequestException('delta cannot be zero');
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: itemId, deletedAt: null },
      });
      if (!item) throw new NotFoundException(`Item ${itemId} not found`);

      let batch = null;
      if (dto.batchId) {
        batch = await tx.stockBatch.findFirst({
          where: { id: dto.batchId, itemId },
        });
        if (!batch) throw new NotFoundException(`Batch ${dto.batchId} not found`);
        if (batch.remainingQty + dto.delta < 0) {
          throw new BadRequestException('adjustment would drive batch below zero');
        }
        await tx.stockBatch.update({
          where: { id: batch.id },
          data: { remainingQty: batch.remainingQty + dto.delta },
        });
      } else if (dto.delta < 0) {
        // Apply across batches FEFO — typical for breakage / count corrections.
        const batches = await tx.stockBatch.findMany({
          where: { itemId, remainingQty: { gt: 0 } },
          orderBy: [{ expiresOn: 'asc' }, { receivedAt: 'asc' }],
        });
        const total = batches.reduce((sum, b) => sum + b.remainingQty, 0);
        if (total + dto.delta < 0) {
          throw new BadRequestException(
            `adjustment would drive total below zero (have ${total}, delta ${dto.delta})`,
          );
        }
        let remaining = -dto.delta;
        for (const b of batches) {
          if (remaining <= 0) break;
          const take = Math.min(b.remainingQty, remaining);
          await tx.stockBatch.update({
            where: { id: b.id },
            data: { remainingQty: { decrement: take } },
          });
          remaining -= take;
        }
      } else {
        // Positive adjustment without batch context creates a synthetic batch
        // (no expiry, no cost). Receive should be preferred for real intake.
        batch = await tx.stockBatch.create({
          data: {
            tenantId: user.tenantId,
            itemId,
            receivedQty: dto.delta,
            remainingQty: dto.delta,
            supplierName: 'adjustment',
            receivedBy: user.userId,
          },
        });
      }

      return tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          itemId,
          batchId: batch?.id ?? null,
          kind: StockMovementKind.ADJUST,
          quantity: dto.delta,
          reason: dto.reason ?? null,
          performedBy: user.userId,
        },
      });
    });
  }

  // ── Reports ──────────────────────────────────────

  async lowStock(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const items = await tx.inventoryItem.findMany({
        where: { deletedAt: null, active: true },
        orderBy: { name: 'asc' },
        take: 500,
      });
      const balances = await this.balancesFor(tx, items.map((i) => i.id));
      const map = new Map(balances.map((b) => [b.itemId, b.onHand]));
      return items
        .map((i) => ({
          id: i.id,
          sku: i.sku,
          name: i.name,
          unit: i.unit,
          reorderLevel: i.reorderLevel,
          onHand: map.get(i.id) ?? 0,
        }))
        .filter((i) => i.onHand <= i.reorderLevel);
    });
  }

  async expiringSoon(user: AuthenticatedUser, days = 60) {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + days);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      return tx.stockBatch.findMany({
        where: {
          remainingQty: { gt: 0 },
          expiresOn: { not: null, lte: horizon },
        },
        include: {
          item: { select: { sku: true, name: true, unit: true } },
        },
        orderBy: { expiresOn: 'asc' },
        take: 200,
      });
    });
  }

  // ── helpers ──────────────────────────────────────

  /** SUM(remainingQty) per item, in one query. */
  private async balancesFor(
    tx: PrismaClient,
    itemIds: string[],
  ): Promise<ItemBalance[]> {
    if (itemIds.length === 0) return [];
    const grouped = await tx.stockBatch.groupBy({
      by: ['itemId'],
      where: { itemId: { in: itemIds } },
      _sum: { remainingQty: true },
    });
    return grouped.map((g) => ({
      itemId: g.itemId,
      onHand: g._sum.remainingQty ?? 0,
    }));
  }
}
