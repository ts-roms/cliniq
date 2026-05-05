import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LabAbnormalFlag,
  LabOrderStatus,
  NotificationKind,
  NotificationSeverity,
  PrismaService,
  type PrismaClient,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type {
  CreateLabOrderDto,
  RecordResultDto,
  UpdateLabOrderDto,
} from './dto/labs.dto.js';

@Injectable()
export class LabsService {
  private readonly logger = new Logger(LabsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationsService,
  ) {}

  // ── Orders ─────────────────────────────────────────

  listForPatient(patientId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labOrder.findMany({
        where: { patientId, deletedAt: null },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  listForConsultation(consultationId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labOrder.findMany({
        where: { consultationId, deletedAt: null },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  detail(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const order = await tx.labOrder.findFirst({
        where: { id, deletedAt: null },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
      if (!order) throw new NotFoundException(`Lab order ${id} not found`);
      return order;
    });
  }

  async create(dto: CreateLabOrderDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, deletedAt: null },
      });
      if (!patient) throw new NotFoundException(`Patient ${dto.patientId} not found`);
      if (dto.consultationId) {
        const consult = await tx.consultation.findFirst({
          where: { id: dto.consultationId, patientId: dto.patientId, deletedAt: null },
        });
        if (!consult) {
          throw new BadRequestException(
            'consultation not found or does not belong to this patient',
          );
        }
      }
      const number = await this.nextOrderNumber(tx, user.tenantId);
      return tx.labOrder.create({
        data: {
          tenantId: user.tenantId,
          patientId: dto.patientId,
          consultationId: dto.consultationId ?? null,
          providerId: user.userId,
          number,
          vendor: dto.vendor,
          externalRef: dto.externalRef,
          notes: dto.notes,
          items: {
            create: dto.items.map((item) => ({
              tenantId: user.tenantId,
              testCode: item.testCode,
              testName: item.testName,
              category: item.category,
              resultUnit: item.resultUnit,
              referenceLow: item.referenceLow,
              referenceHigh: item.referenceHigh,
            })),
          },
        },
        include: { items: true },
      });
    });
  }

  /**
   * Status transitions write timestamp side-effects (collectedAt / receivedAt /
   * reportedAt). Caller may also pass explicit timestamps; we don't overwrite
   * once set.
   */
  async update(id: string, dto: UpdateLabOrderDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.labOrder.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) throw new NotFoundException(`Lab order ${id} not found`);
      if (existing.status === LabOrderStatus.CANCELLED) {
        throw new BadRequestException('cannot update a cancelled order');
      }
      const data: Record<string, unknown> = { ...dto };
      if (dto.status === LabOrderStatus.COLLECTED && !existing.collectedAt) {
        data['collectedAt'] = dto.collectedAt ?? new Date();
      }
      if (dto.status === LabOrderStatus.RECEIVED && !existing.receivedAt) {
        data['receivedAt'] = dto.receivedAt ?? new Date();
      }
      if (dto.status === LabOrderStatus.REPORTED && !existing.reportedAt) {
        data['reportedAt'] = new Date();
      }
      return tx.labOrder.update({
        where: { id },
        data,
        include: { items: true },
      });
    });
  }

  async cancel(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.labOrder.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) throw new NotFoundException(`Lab order ${id} not found`);
      if (existing.status === LabOrderStatus.REPORTED) {
        throw new BadRequestException('cannot cancel a fully reported order');
      }
      return tx.labOrder.update({
        where: { id },
        data: { status: LabOrderStatus.CANCELLED },
      });
    });
  }

  /**
   * Record a result for a single test. Auto-computes abnormalFlag from
   * referenceLow/referenceHigh when the value is numeric and the caller didn't
   * provide an explicit flag. Bumps the parent order to REPORTED when every
   * item has a value.
   */
  async recordResult(
    orderId: string,
    itemId: string,
    dto: RecordResultDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const item = await tx.labOrderItem.findFirst({
        where: { id: itemId, orderId },
      });
      if (!item) throw new NotFoundException(`Item ${itemId} not found in order ${orderId}`);

      const flag =
        dto.abnormalFlag ??
        deriveFlag(dto.resultValue, item.referenceLow ?? null, item.referenceHigh ?? null);

      const updatedItem = await tx.labOrderItem.update({
        where: { id: itemId },
        data: {
          resultValue: dto.resultValue,
          resultUnit: dto.resultUnit ?? item.resultUnit,
          abnormalFlag: flag,
          comment: dto.comment ?? item.comment,
          reportedAt: new Date(),
        },
      });

      const remaining = await tx.labOrderItem.count({
        where: { orderId, OR: [{ resultValue: null }, { resultValue: '' }] },
      });
      const isAbnormal =
        flag &&
        flag !== LabAbnormalFlag.NORMAL;
      const isCritical =
        flag === LabAbnormalFlag.CRITICAL_HIGH ||
        flag === LabAbnormalFlag.CRITICAL_LOW;

      let orderJustReported = false;
      if (remaining === 0) {
        await tx.labOrder.update({
          where: { id: orderId },
          data: { status: LabOrderStatus.REPORTED, reportedAt: new Date() },
        });
        this.logger.log(`order ${orderId} fully reported`);
        orderJustReported = true;
      }

      // Notify the ordering provider of abnormal/critical results immediately,
      // and of the full REPORTED transition once everything's in. Notification
      // delivery is best-effort — we don't roll back the result on failure.
      const order = await tx.labOrder.findFirst({
        where: { id: orderId },
        select: { number: true, providerId: true, patientId: true },
      });
      if (order) {
        if (isAbnormal) {
          void this.notif.notify({
            tenantId: user.tenantId,
            userId: order.providerId,
            kind: NotificationKind.LAB_ABNORMAL,
            severity: isCritical ? NotificationSeverity.CRITICAL : NotificationSeverity.WARNING,
            title: `${item.testName}: ${flag}`,
            body: `${dto.resultValue}${item.resultUnit ? ` ${item.resultUnit}` : ''} (${order.number})`,
            link: `/patients/${order.patientId}`,
            entityId: orderId,
          });
        }
        if (orderJustReported) {
          void this.notif.notify({
            tenantId: user.tenantId,
            userId: order.providerId,
            kind: NotificationKind.LAB_REPORTED,
            severity: NotificationSeverity.INFO,
            title: `Lab order ${order.number} reported`,
            link: `/patients/${order.patientId}`,
            entityId: orderId,
          });
        }
      }
      return updatedItem;
    });
  }

  // ── helpers ──────────────────────────────────────

  private async nextOrderNumber(tx: PrismaClient, tenantId: string): Promise<string> {
    const now = new Date();
    const prefix = `LAB-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthCount = await tx.labOrder.count({
      where: { tenantId, number: { startsWith: prefix } },
    });
    return `${prefix}-${String(monthCount + 1).padStart(4, '0')}`;
  }
}

/**
 * Map a numeric result against a reference range to a flag. Non-numeric
 * results return undefined — caller should pass explicit ABNORMAL / NORMAL
 * for qualitative tests ("Reactive", "Negative", etc.).
 */
function deriveFlag(
  value: string,
  low: number | null,
  high: number | null,
): LabAbnormalFlag | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (low === null && high === null) return LabAbnormalFlag.NORMAL;
  if (high !== null) {
    const criticalHigh = high * 1.5;
    if (n >= criticalHigh) return LabAbnormalFlag.CRITICAL_HIGH;
    if (n > high) return LabAbnormalFlag.HIGH;
  }
  if (low !== null) {
    const criticalLow = low * 0.5;
    if (n <= criticalLow) return LabAbnormalFlag.CRITICAL_LOW;
    if (n < low) return LabAbnormalFlag.LOW;
  }
  return LabAbnormalFlag.NORMAL;
}
