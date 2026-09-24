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
import {
  ageInDays,
  deriveFlag,
  isAbnormal,
  isCritical,
  normaliseTestKey,
  selectCriticalRule,
  type PatientSex,
  type ResultFlag,
} from './flagging.js';

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
    // An inverted per-order override would make every result critical on one
    // side. CriticalValueRule has a DB CHECK for this; order items do not, so
    // the guard lives here.
    for (const item of dto.items) {
      if (
        item.criticalLow !== undefined &&
        item.criticalHigh !== undefined &&
        item.criticalLow >= item.criticalHigh
      ) {
        throw new BadRequestException(
          `${item.testName}: criticalLow must be below criticalHigh`,
        );
      }
    }
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, deletedAt: null },
      });
      if (!patient)
        throw new NotFoundException(`Patient ${dto.patientId} not found`);
      if (dto.consultationId) {
        const consult = await tx.consultation.findFirst({
          where: {
            id: dto.consultationId,
            patientId: dto.patientId,
            deletedAt: null,
          },
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
              criticalLow: item.criticalLow,
              criticalHigh: item.criticalHigh,
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
   * Record a result for a single test.
   *
   * When the caller does not supply an explicit flag and the value is numeric,
   * the flag is computed from the item's reference interval plus whichever
   * critical limits apply: the item's own overrides if set, else the tenant's
   * CriticalValueRule for this test, narrowed by the patient's age and sex.
   *
   * With no critical limits configured a result can still be HIGH or LOW but
   * is NEVER called CRITICAL. It used to be — the limits were derived as
   * 1.5x / 0.5x the reference bounds, which under-flagged exactly the results
   * that needed a phone call. See ./flagging.ts.
   *
   * Bumps the parent order to REPORTED when every item has a value.
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
      if (!item)
        throw new NotFoundException(
          `Item ${itemId} not found in order ${orderId}`,
        );

      // An explicitly-supplied flag still needs limits resolved, because a
      // critical result must record WHICH thresholds applied even when a human
      // set the flag by hand (qualitative results, referred-in reports).
      const resolution = await this.resolveFlag(
        tx,
        item,
        dto.resultValue,
        user.tenantId,
      );
      const flag = dto.abnormalFlag ?? resolution.flag;

      const updatedItem = await tx.labOrderItem.update({
        where: { id: itemId },
        data: {
          resultValue: dto.resultValue,
          resultUnit: dto.resultUnit ?? item.resultUnit,
          // `?? null`, not `flag`: Prisma OMITS an undefined field, which
          // would leave the previous flag in place when a corrected value no
          // longer warrants one — a result reading "4.2  HIGH" because 6.8
          // was recorded first. Recording a result always (re)states its flag.
          abnormalFlag: flag ?? null,
          comment: dto.comment ?? item.comment,
          reportedAt: new Date(),
        },
      });

      const remaining = await tx.labOrderItem.count({
        where: { orderId, OR: [{ resultValue: null }, { resultValue: '' }] },
      });
      const abnormal = isAbnormal(flag as ResultFlag | null | undefined);
      const critical = isCritical(flag as ResultFlag | null | undefined);

      let orderJustReported = false;
      if (remaining === 0) {
        await tx.labOrder.update({
          where: { id: orderId },
          data: { status: LabOrderStatus.REPORTED, reportedAt: new Date() },
        });
        this.logger.log(`order ${orderId} fully reported`);
        orderJustReported = true;
      }

      const order = await tx.labOrder.findFirst({
        where: { id: orderId },
        select: { number: true, providerId: true, patientId: true },
      });

      // A critical result creates an obligation to tell someone, and that
      // obligation is recorded IN THIS TRANSACTION. Delivery below is still
      // best-effort; the record is not. Previously a failed notify() left no
      // trace that anyone should have been told.
      let criticalNotificationId: string | null = null;
      if (critical && order) {
        const created = await tx.criticalResultNotification.create({
          data: {
            tenantId: user.tenantId,
            orderId,
            orderItemId: itemId,
            patientId: order.patientId,
            testName: item.testName,
            resultValue: dto.resultValue,
            resultUnit: dto.resultUnit ?? item.resultUnit,
            flag: flag as LabAbnormalFlag,
            criticalLow: resolution.criticalLow,
            criticalHigh: resolution.criticalHigh,
            ruleId: resolution.ruleId,
            recipientUserId: order.providerId,
            dueAt: new Date(
              Date.now() + resolution.notifyWithinMinutes * 60_000,
            ),
          },
          select: { id: true },
        });
        criticalNotificationId = created.id;
        this.logger.warn(
          `critical result ${flag} on ${item.testName} (order ${order.number}) — notification ${created.id} raised for user ${order.providerId}`,
        );
      }

      // Notify the ordering provider of abnormal/critical results immediately,
      // and of the full REPORTED transition once everything's in. Delivery is
      // best-effort — we don't roll back the result on failure — but for a
      // critical result the outcome is stamped on the row above so a silent
      // failure is visible in the unacknowledged queue.
      if (order) {
        if (abnormal) {
          const delivery = this.notif.notify({
            tenantId: user.tenantId,
            userId: order.providerId,
            kind: NotificationKind.LAB_ABNORMAL,
            severity: critical
              ? NotificationSeverity.CRITICAL
              : NotificationSeverity.WARNING,
            title: `${item.testName}: ${flag}`,
            body: `${dto.resultValue}${item.resultUnit ? ` ${item.resultUnit}` : ''} (${order.number})`,
            link: `/patients/${order.patientId}`,
            entityId: orderId,
          });
          if (criticalNotificationId) {
            void this.recordDelivery(
              user.tenantId,
              criticalNotificationId,
              delivery,
            );
          } else {
            void delivery.catch(() => undefined);
          }
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

  /**
   * Stamp the outcome of the in-app delivery onto the critical notification.
   *
   * Runs outside the result transaction on purpose: the obligation is already
   * durable, and a push/in-app failure must not roll back a recorded result.
   * Either way the row ends up truthy — `notifiedAt` set, or `deliveryError`
   * explaining why not — so the unacknowledged queue shows both "nobody has
   * acknowledged this" and "we could not even reach them".
   */
  private async recordDelivery(
    tenantId: string,
    notificationId: string,
    delivery: Promise<unknown>,
  ): Promise<void> {
    let error: string | null = null;
    try {
      await delivery;
    } catch (err) {
      error = (err as Error).message.slice(0, 500);
      this.logger.error(
        `critical notification ${notificationId} delivery failed: ${error}`,
      );
    }
    try {
      await this.prisma.withTenant(tenantId, null, (tx) =>
        tx.criticalResultNotification.update({
          where: { id: notificationId },
          data: error
            ? { deliveryError: error }
            : { notifiedAt: new Date(), deliveryError: null },
        }),
      );
    } catch (err) {
      this.logger.error(
        `could not stamp delivery on ${notificationId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Resolve the limits that apply to one result, then flag it.
   *
   * Precedence for critical limits:
   *   1. the item's own criticalLow / criticalHigh, when this order overrides
   *   2. the tenant's CriticalValueRule for the test, narrowed by the
   *      patient's age and sex and by the effective window
   *   3. none — the result is flagged against its reference interval only and
   *      can never come back CRITICAL
   *
   * Age and sex come from the patient on the order. An unknown date of birth
   * or sex matches only rules that do not narrow on that dimension, so a
   * neonatal limit is never applied to a patient we cannot age.
   *
   * Returns the limits that were actually applied, not just the flag: a
   * critical result has to record WHICH thresholds made it critical, because
   * the rule can be superseded and the result still has to be explicable.
   */
  private async resolveFlag(
    tx: PrismaClient,
    item: {
      testCode: string | null;
      testName: string;
      referenceLow: number | null;
      referenceHigh: number | null;
      criticalLow: number | null;
      criticalHigh: number | null;
      orderId: string;
    },
    resultValue: string,
    tenantId: string,
  ): Promise<FlagResolution> {
    const reference = {
      referenceLow: item.referenceLow,
      referenceHigh: item.referenceHigh,
    };

    // 1. Per-order override short-circuits the lookup entirely.
    if (item.criticalLow !== null || item.criticalHigh !== null) {
      const limits = {
        criticalLow: item.criticalLow,
        criticalHigh: item.criticalHigh,
      };
      return {
        flag: toDbFlag(deriveFlag(resultValue, reference, limits)),
        ...limits,
        ruleId: null,
        notifyWithinMinutes: DEFAULT_CRITICAL_NOTIFY_MINUTES,
      };
    }

    const testKey = normaliseTestKey(item.testCode, item.testName);
    if (testKey === '')
      return noCriticalLimits(deriveFlag(resultValue, reference));

    const now = new Date();
    const rules = await tx.criticalValueRule.findMany({
      where: {
        tenantId,
        testKey,
        deletedAt: null,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
    });
    if (rules.length === 0) {
      return noCriticalLimits(deriveFlag(resultValue, reference));
    }

    const order = await tx.labOrder.findFirst({
      where: { id: item.orderId },
      select: { patient: { select: { dateOfBirth: true, sex: true } } },
    });
    const patient = {
      ageDays: ageInDays(order?.patient?.dateOfBirth ?? null, now),
      sex: (order?.patient?.sex ?? null) as PatientSex | null,
    };

    const rule = selectCriticalRule(rules, patient, now);
    if (!rule) return noCriticalLimits(deriveFlag(resultValue, reference));

    const limits = {
      criticalLow: rule.criticalLow,
      criticalHigh: rule.criticalHigh,
    };
    return {
      flag: toDbFlag(deriveFlag(resultValue, reference, limits)),
      ...limits,
      ruleId: rule.id,
      notifyWithinMinutes:
        rule.notifyWithinMinutes ?? DEFAULT_CRITICAL_NOTIFY_MINUTES,
    };
  }

  // ── helpers ──────────────────────────────────────

  private async nextOrderNumber(
    tx: PrismaClient,
    tenantId: string,
  ): Promise<string> {
    const now = new Date();
    const prefix = `LAB-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthCount = await tx.labOrder.count({
      where: { tenantId, number: { startsWith: prefix } },
    });
    return `${prefix}-${String(monthCount + 1).padStart(4, '0')}`;
  }
}

/**
 * flagging.ts is deliberately Prisma-free, so its ResultFlag is a plain union.
 * The two vocabularies are identical by construction; this is the one place
 * that crosses between them.
 */
function toDbFlag(flag: ResultFlag | undefined): LabAbnormalFlag | undefined {
  return flag === undefined ? undefined : (flag as LabAbnormalFlag);
}

/**
 * How long a clinician has to acknowledge a critical result before the
 * escalation sweep picks it up, when the rule does not say. An hour is a
 * deliberately loose default: the point of the sweep is to catch results
 * nobody looked at, not to page people over a busy morning.
 */
const DEFAULT_CRITICAL_NOTIFY_MINUTES = 60;

/** The flag plus the critical limits that produced it (if any). */
interface FlagResolution {
  flag: LabAbnormalFlag | undefined;
  criticalLow: number | null;
  criticalHigh: number | null;
  ruleId: string | null;
  notifyWithinMinutes: number;
}

function noCriticalLimits(flag: ResultFlag | undefined): FlagResolution {
  return {
    flag: toDbFlag(flag),
    criticalLow: null,
    criticalHigh: null,
    ruleId: null,
    notifyWithinMinutes: DEFAULT_CRITICAL_NOTIFY_MINUTES,
  };
}
