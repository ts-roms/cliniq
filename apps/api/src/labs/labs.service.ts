import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LabAbnormalFlag,
  LabOrderStatus,
  LabResultStatus,
  NotificationKind,
  NotificationSeverity,
  PrismaService,
  SpecimenStatus,
  type PrismaClient,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type {
  AmendResultDto,
  CreateLabOrderDto,
  RecordResultDto,
  UpdateLabOrderDto,
} from './dto/labs.dto.js';
import {
  formatOrderNumber,
  nextSequenceValue,
  orderPeriod,
} from './accession.js';
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
import {
  canAmend,
  canVerify,
  isReleased,
  orderIsFullyReported,
  readVerificationPolicy,
  statusOnEntry,
  type VerificationPolicy,
} from './verification.js';

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
      if (!item.testId && !item.testName?.trim()) {
        throw new BadRequestException(
          'each item needs either testId (order from the catalogue) or testName',
        );
      }
      if (
        item.criticalLow !== undefined &&
        item.criticalHigh !== undefined &&
        item.criticalLow >= item.criticalHigh
      ) {
        throw new BadRequestException(
          `${item.testName ?? item.testId}: criticalLow must be below criticalHigh`,
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
      // Resolve catalogue entries once, inside the tenant context so a test
      // from another clinic simply is not found.
      const testIds = [
        ...new Set(dto.items.map((i) => i.testId).filter(Boolean)),
      ] as string[];
      const tests = testIds.length
        ? await tx.laboratoryTest.findMany({
            where: { id: { in: testIds }, deletedAt: null },
            include: {
              components: {
                where: { deletedAt: null },
                orderBy: { displayOrder: 'asc' },
              },
            },
          })
        : [];
      const byId = new Map(tests.map((t) => [t.id, t]));
      for (const id of testIds) {
        if (!byId.has(id)) {
          throw new BadRequestException(
            `test ${id} not found in this tenant's catalogue`,
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
            create: dto.items.map((item) => {
              const test = item.testId ? byId.get(item.testId) : undefined;
              // Snapshot, not join: the catalogue can be edited or retired,
              // and a historical order must still read as it was placed.
              // Anything the caller passed explicitly wins, so an ad-hoc
              // override on one order stays possible.
              const single =
                test && test.components.length === 1
                  ? test.components[0]
                  : undefined;
              return {
                tenantId: user.tenantId,
                testId: item.testId ?? null,
                testCode: item.testCode ?? test?.code ?? null,
                testName: item.testName ?? test?.name ?? '',
                category: item.category,
                // A panel reports many units, so there is no single one to
                // copy — only a one-component test can supply it.
                resultUnit: item.resultUnit ?? single?.unit ?? null,
                referenceLow: item.referenceLow,
                referenceHigh: item.referenceHigh,
                criticalLow: item.criticalLow,
                criticalHigh: item.criticalHigh,
              };
            }),
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
        include: { specimen: { select: { id: true, status: true } } },
      });
      if (!item)
        throw new NotFoundException(
          `Item ${itemId} not found in order ${orderId}`,
        );

      // A result belongs to a tube. If this item is still attached to one
      // that was thrown away or called off, whatever is being keyed in did
      // not come from it.
      //
      // REJECTED is here for completeness rather than reachability: rejecting
      // a specimen detaches its items so they can be re-collected, so in
      // practice the link is already gone. CANCELLED does not detach, which
      // is the case this actually catches.
      if (
        item.specimen?.status === SpecimenStatus.REJECTED ||
        item.specimen?.status === SpecimenStatus.CANCELLED
      ) {
        throw new BadRequestException(
          `this test is on a ${item.specimen.status.toLowerCase()} specimen; re-collect it before recording a result`,
        );
      }

      const policy = await this.verificationPolicy(tx, user.tenantId);

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
      const now = new Date();
      const status = statusOnEntry(policy);

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
          resultStatus: status,
          enteredById: user.userId,
          enteredAt: now,
          // With verification off, entering a result also releases it. Both
          // stamps name the same person, which is the honest record of what
          // happened rather than a blank where the releaser should be.
          verifiedById: isReleased(status) ? user.userId : null,
          verifiedAt: isReleased(status) ? now : null,
          // Only a released result has been reported to anyone.
          reportedAt: isReleased(status) ? now : null,
        },
      });

      await this.appendVersion(tx, user, {
        orderItemId: itemId,
        resultValue: dto.resultValue,
        resultUnit: dto.resultUnit ?? item.resultUnit,
        abnormalFlag: flag ?? null,
        comment: dto.comment ?? item.comment,
        status,
      });

      await this.advanceSpecimen(tx, item.specimenId);

      const abnormal = isAbnormal(flag as ResultFlag | null | undefined);
      const critical = isCritical(flag as ResultFlag | null | undefined);

      const orderJustReported = await this.settleOrderStatus(tx, orderId);

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
        // A critical value is phoned before anyone formally releases it —
        // that is the point of it being critical — so this fires even on a
        // PRELIMINARY result. A merely HIGH/LOW result waits for release:
        // telling a doctor about a value nobody has stood behind yet invites
        // action on a number that may still change.
        if (abnormal && (critical || isReleased(status))) {
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
   * Release a result to the chart.
   *
   * This is the act the whole chain exists for: someone qualified puts their
   * name to a value, and only then does it count as reported. Whether the
   * verifier may be the person who entered it is the clinic's own setting —
   * see ./verification.ts for why that is configurable rather than fixed.
   */
  async verifyResult(orderId: string, itemId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const item = await tx.labOrderItem.findFirst({
        where: { id: itemId, orderId },
      });
      if (!item)
        throw new NotFoundException(
          `Item ${itemId} not found in order ${orderId}`,
        );

      const policy = await this.verificationPolicy(tx, user.tenantId);
      const verdict = canVerify(
        item.resultStatus as never,
        item.enteredById,
        user.userId,
        policy,
      );
      if (!verdict.ok) throw new BadRequestException(verdict.reason);

      const now = new Date();
      const updated = await tx.labOrderItem.update({
        where: { id: itemId },
        data: {
          resultStatus: LabResultStatus.FINAL,
          verifiedById: user.userId,
          verifiedAt: now,
          reportedAt: now,
        },
      });

      await this.appendVersion(tx, user, {
        orderItemId: itemId,
        resultValue: item.resultValue,
        resultUnit: item.resultUnit,
        abnormalFlag: item.abnormalFlag,
        comment: item.comment,
        status: LabResultStatus.FINAL,
      });

      await this.advanceSpecimen(tx, item.specimenId);
      const orderJustReported = await this.settleOrderStatus(tx, orderId);

      this.logger.log(
        `result ${itemId} (${item.testName}) released by ${user.userId}`,
      );

      if (orderJustReported) {
        const order = await tx.labOrder.findFirst({
          where: { id: orderId },
          select: { number: true, providerId: true, patientId: true },
        });
        if (order) {
          void this.notif
            .notify({
              tenantId: user.tenantId,
              userId: order.providerId,
              kind: NotificationKind.LAB_REPORTED,
              severity: NotificationSeverity.INFO,
              title: `Lab order ${order.number} reported`,
              link: `/patients/${order.patientId}`,
              entityId: orderId,
            })
            .catch(() => undefined);
        }
      }
      return updated;
    });
  }

  /**
   * Correct a result that has already been released.
   *
   * Distinct from re-entering one: a clinician may have acted on the previous
   * value, so the correction carries a stated reason and the superseded value
   * stays readable in the version history. The corrected value is re-flagged
   * from scratch, and a correction that is newly critical raises a fresh
   * notification — the doctor who saw the old number needs telling.
   */
  async amendResult(
    orderId: string,
    itemId: string,
    dto: AmendResultDto,
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

      const verdict = canAmend(item.resultStatus as never);
      if (!verdict.ok) throw new BadRequestException(verdict.reason);

      const resolution = await this.resolveFlag(
        tx,
        item,
        dto.resultValue,
        user.tenantId,
      );
      const flag = dto.abnormalFlag ?? resolution.flag;
      const now = new Date();
      const previousValue = item.resultValue;

      const updated = await tx.labOrderItem.update({
        where: { id: itemId },
        data: {
          resultValue: dto.resultValue,
          resultUnit: dto.resultUnit ?? item.resultUnit,
          abnormalFlag: flag ?? null,
          comment: dto.comment ?? item.comment,
          resultStatus: LabResultStatus.CORRECTED,
          verifiedById: user.userId,
          verifiedAt: now,
          reportedAt: now,
        },
      });

      await this.appendVersion(tx, user, {
        orderItemId: itemId,
        resultValue: dto.resultValue,
        resultUnit: dto.resultUnit ?? item.resultUnit,
        abnormalFlag: flag ?? null,
        comment: dto.comment ?? item.comment,
        status: LabResultStatus.CORRECTED,
        reason: dto.reason,
      });

      const order = await tx.labOrder.findFirst({
        where: { id: orderId },
        select: { number: true, providerId: true, patientId: true },
      });

      // A correction that is newly critical raises its own obligation. The
      // original notification acknowledged a value that is no longer true.
      if (isCritical(flag as ResultFlag | null | undefined) && order) {
        await tx.criticalResultNotification.create({
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
        });
      }

      if (order) {
        void this.notif
          .notify({
            tenantId: user.tenantId,
            userId: order.providerId,
            kind: NotificationKind.LAB_ABNORMAL,
            severity: NotificationSeverity.WARNING,
            title: `Corrected result: ${item.testName}`,
            body: `${previousValue ?? '—'} → ${dto.resultValue} (${order.number}). ${dto.reason}`,
            link: `/patients/${order.patientId}`,
            entityId: orderId,
          })
          .catch(() => undefined);
      }

      this.logger.warn(
        `result ${itemId} (${item.testName}) corrected by ${user.userId}: ${dto.reason}`,
      );
      return updated;
    });
  }

  /** The audit trail for one result: every value it has ever held. */
  async resultHistory(
    orderId: string,
    itemId: string,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const item = await tx.labOrderItem.findFirst({
        where: { id: itemId, orderId },
        select: { id: true },
      });
      if (!item)
        throw new NotFoundException(
          `Item ${itemId} not found in order ${orderId}`,
        );
      return tx.labResultVersion.findMany({
        where: { orderItemId: itemId },
        orderBy: { version: 'asc' },
      });
    });
  }

  // ── verification helpers ─────────────────────────

  /** The clinic's own verification policy, defaulted when unset. */
  private async verificationPolicy(
    tx: PrismaClient,
    tenantId: string,
  ): Promise<VerificationPolicy> {
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId },
      select: { settings: true },
    });
    return readVerificationPolicy(tenant?.settings);
  }

  /**
   * Append one row to a result's history.
   *
   * The version number is allocated from the rows already there, inside the
   * caller's transaction. Two concurrent writers can read the same max, but
   * the unique index on (tenantId, orderItemId, version) then rejects the
   * second — losing a write rather than silently collapsing two corrections
   * onto one version number.
   */
  private async appendVersion(
    tx: PrismaClient,
    user: AuthenticatedUser,
    v: {
      orderItemId: string;
      resultValue: string | null;
      resultUnit: string | null;
      abnormalFlag: LabAbnormalFlag | null;
      comment: string | null;
      status: LabResultStatus;
      reason?: string;
    },
  ) {
    const last = await tx.labResultVersion.findFirst({
      where: { orderItemId: v.orderItemId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return tx.labResultVersion.create({
      data: {
        tenantId: user.tenantId,
        orderItemId: v.orderItemId,
        version: (last?.version ?? 0) + 1,
        resultValue: v.resultValue,
        resultUnit: v.resultUnit,
        abnormalFlag: v.abnormalFlag,
        comment: v.comment,
        status: v.status,
        // The CHECK constraint requires a reason for CORRECTED and forbids
        // one otherwise, so this cannot drift from the status.
        reason:
          v.status === LabResultStatus.CORRECTED ? (v.reason ?? null) : null,
        recordedById: user.userId,
      },
    });
  }

  /**
   * Move a specimen along as its results come in.
   *
   * RECEIVED means it is sitting on the bench; the first result is what makes
   * it PROCESSING. Once every test on it is released there is nothing left to
   * do with the tube, so it is COMPLETED. This is the linkage that lets a
   * specimen worklist reflect reality instead of being driven by hand.
   */
  private async advanceSpecimen(tx: PrismaClient, specimenId: string | null) {
    if (!specimenId) return;
    const specimen = await tx.specimen.findFirst({
      where: { id: specimenId },
      select: { id: true, status: true },
    });
    if (!specimen) return;

    const items = await tx.labOrderItem.findMany({
      where: { specimenId },
      select: { resultStatus: true },
    });
    const allReleased = orderIsFullyReported(
      items.map((i) => i.resultStatus as never),
    );

    if (allReleased) {
      if (
        specimen.status === SpecimenStatus.RECEIVED ||
        specimen.status === SpecimenStatus.PROCESSING
      ) {
        await tx.specimen.update({
          where: { id: specimenId },
          data: { status: SpecimenStatus.COMPLETED },
        });
      }
      return;
    }
    if (specimen.status === SpecimenStatus.RECEIVED) {
      await tx.specimen.update({
        where: { id: specimenId },
        data: { status: SpecimenStatus.PROCESSING },
      });
    }
  }

  /**
   * Bring the order's status in line with its items.
   *
   * Returns whether THIS call is what reported it, so the caller knows
   * whether to send the "order reported" notification. The order used to flip
   * to REPORTED as soon as every item had a value, which reported results
   * nobody had released.
   */
  private async settleOrderStatus(
    tx: PrismaClient,
    orderId: string,
  ): Promise<boolean> {
    const items = await tx.labOrderItem.findMany({
      where: { orderId },
      select: { resultStatus: true },
    });
    if (!orderIsFullyReported(items.map((i) => i.resultStatus as never))) {
      return false;
    }
    const order = await tx.labOrder.findFirst({
      where: { id: orderId },
      select: { status: true },
    });
    if (order?.status === LabOrderStatus.REPORTED) return false;

    await tx.labOrder.update({
      where: { id: orderId },
      data: { status: LabOrderStatus.REPORTED, reportedAt: new Date() },
    });
    this.logger.log(`order ${orderId} fully reported`);
    return true;
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

  /**
   * Allocate the next order-slip number.
   *
   * This used to count-then-format:
   *
   *     const n = await tx.labOrder.count({ where: { number: { startsWith } } });
   *     return `${prefix}-${n + 1}`;
   *
   * At READ COMMITTED two concurrent orders read the same count and format
   * the same number; the unique index then failed one insert and it surfaced
   * as a 500 on a perfectly valid request. It now shares the atomic allocator
   * the accession numbers use — see ./accession.ts.
   */
  private async nextOrderNumber(
    tx: PrismaClient,
    tenantId: string,
  ): Promise<string> {
    const now = new Date();
    const value = await nextSequenceValue(
      tx,
      tenantId,
      'LAB_ORDER',
      orderPeriod(now),
    );
    return formatOrderNumber(now, value);
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
