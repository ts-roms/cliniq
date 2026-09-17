import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PrismaService,
  AppointmentStatus,
  AppointmentType,
  NotificationKind,
  NotificationSeverity,
  type PrismaClient,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { MailerService } from '../mailer/mailer.service.js';
import { SmsService } from '../sms/sms.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WebhooksService } from '../webhooks/webhooks.service.js';
import type {
  AppointmentRangeDto,
  CreateAppointmentDto,
} from './dto/create-appointment.dto.js';
import type {
  CancelAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/transition.dto.js';
import {
  IllegalTransitionError,
  RESCHEDULABLE,
  assertTransition,
  overlapWhere,
  transitionData,
} from './appointment-transitions.js';

const DEFAULT_NO_SHOW_GRACE_MIN = 30;

@Injectable()
export class AppointmentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppointmentsService.name);
  private readonly reminderEnabled: boolean;
  private readonly reminderIntervalMs: number;
  private readonly reminderLeadMinutes: number;
  private readonly autoNoShowEnabled: boolean;
  private readonly noShowGraceMinutes: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly sms: SmsService,
    private readonly notif: NotificationsService,
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
  ) {
    this.reminderEnabled =
      (this.config.get<string>('APPT_REMINDERS_ENABLED') ?? 'false') === 'true';
    this.reminderIntervalMs = Number(
      this.config.get<string>('APPT_REMINDER_INTERVAL_MS') ?? 5 * 60_000,
    );
    this.reminderLeadMinutes = Number(
      this.config.get<string>('APPT_REMINDER_LEAD_MINUTES') ?? 60,
    );
    this.autoNoShowEnabled =
      (this.config.get<string>('APPT_AUTO_NOSHOW_ENABLED') ?? 'false') ===
      'true';
    this.noShowGraceMinutes = Number(
      this.config.get<string>('APPT_NOSHOW_GRACE_MINUTES') ??
        DEFAULT_NO_SHOW_GRACE_MIN,
    );
  }

  // ── background sweeps ─────────────────────────────
  // One interval drives both the reminder pass and the auto no-show pass.
  // Each is gated by its own env flag; with neither on, no timer is armed.
  // Single-replica only (see docs/audit-checklist.md P2 — a worker is the
  // real fix). Both are idempotent, so a double-run is noisy, not wrong.
  onModuleInit(): void {
    if (!this.reminderEnabled) {
      this.logger.log(
        'appointment reminders disabled (set APPT_REMINDERS_ENABLED=true)',
      );
    }
    if (!this.autoNoShowEnabled) {
      this.logger.log(
        'auto no-show disabled (set APPT_AUTO_NOSHOW_ENABLED=true)',
      );
    }
    if (!this.reminderEnabled && !this.autoNoShowEnabled) return;

    this.timer = setInterval(() => {
      if (this.reminderEnabled) {
        void this.sendDueReminders().catch((err) =>
          this.logger.warn(`reminder sweep failed: ${(err as Error).message}`),
        );
      }
      if (this.autoNoShowEnabled) {
        void this.markOverdueNoShows().catch((err) =>
          this.logger.warn(`no-show sweep failed: ${(err as Error).message}`),
        );
      }
    }, this.reminderIntervalMs);
    this.logger.log(
      `appointment sweeps scheduled every ${this.reminderIntervalMs / 1000}s`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Manually triggerable for tests + CI smoke. Returns count of reminders
   * fired. Cross-tenant system sweep → platform context (the
   * `appointments_platform_*` policies); a bare query under cliniq_app sees
   * no rows at all.
   */
  async sendDueReminders(): Promise<number> {
    const now = Date.now();
    const windowEnd = new Date(now + this.reminderLeadMinutes * 60_000);
    const windowStart = new Date(now);

    const due = await this.prisma.withPlatformContext((tx) =>
      tx.appointment.findMany({
        where: {
          status: AppointmentStatus.SCHEDULED,
          reminderSentAt: null,
          startsAt: { gte: windowStart, lte: windowEnd },
          deletedAt: null,
        },
        include: {
          patient: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
        take: 200,
      }),
    );

    let count = 0;
    for (const appt of due) {
      const when = appt.startsAt.toLocaleString();
      if (appt.patient.email) {
        await this.mailer.send({
          to: appt.patient.email,
          subject: 'ClinIQ appointment reminder',
          text:
            `Hi ${appt.patient.firstName},\n\n` +
            `This is a reminder for your appointment on ${when}.\n` +
            `Reason: ${appt.reason ?? '—'}\n\n` +
            `If you need to reschedule, please contact your clinic.\n`,
        });
      }
      if (appt.patient.phone) {
        // SMS body kept under 160 chars to fit a single segment.
        await this.sms.send({
          to: appt.patient.phone,
          body:
            `ClinIQ: Hi ${appt.patient.firstName}, reminder for your appt on ${when}. ` +
            `Reply to your clinic to reschedule.`,
        });
      }
      // In-app notification for the provider so they see today's queue without
      // checking the schedule page. Best-effort; failure does not block the
      // reminder bookkeeping below.
      void this.notif.notify({
        tenantId: appt.tenantId,
        userId: appt.providerId,
        kind: NotificationKind.APPOINTMENT_REMINDER,
        severity: NotificationSeverity.INFO,
        title: `Upcoming: ${appt.patient.lastName}, ${appt.patient.firstName}`,
        body: `${when}${appt.reason ? ` · ${appt.reason}` : ''}`,
        link: `/schedule`,
        entityId: appt.id,
      });
      await this.prisma.withPlatformContext((tx) =>
        tx.appointment.update({
          where: { id: appt.id },
          data: { reminderSentAt: new Date() },
        }),
      );
      count++;
    }
    if (count > 0) this.logger.log(`sent ${count} appointment reminder(s)`);
    return count;
  }

  /**
   * SCHEDULED appointments whose slot *ended* more than the grace period
   * ago and were never checked in → NO_SHOW. Runs cross-tenant (platform
   * context) because it is a system sweep, not a user action; each tenant's
   * rows are touched with the same rule. Returns the number marked.
   *
   * `graceMinutes` overrides the env default (the admin endpoint uses 0 to
   * mean "anything already past its end time").
   */
  async markOverdueNoShows(
    graceMinutes = this.noShowGraceMinutes,
    tenantId?: string,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - graceMinutes * 60_000);
    const res = await this.prisma.withPlatformContext((tx) =>
      tx.appointment.updateMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          status: AppointmentStatus.SCHEDULED,
          endsAt: { lt: cutoff },
          deletedAt: null,
        },
        data: transitionData(AppointmentStatus.NO_SHOW),
      }),
    );
    if (res.count > 0)
      this.logger.log(`marked ${res.count} appointment(s) as NO_SHOW`);
    return res.count;
  }

  // ── CRUD ─────────────────────────────────────────
  async create(dto: CreateAppointmentDto, user: AuthenticatedUser) {
    if (dto.endsAt <= dto.startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    const created = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      async (tx) => {
        const patient = await tx.patient.findFirst({
          where: { id: dto.patientId, deletedAt: null },
          select: { id: true },
        });
        if (!patient)
          throw new NotFoundException(`Patient ${dto.patientId} not found`);
        await this.assertSlotFree(tx, dto.providerId, dto.startsAt, dto.endsAt);
        return this.catchOverlap(() =>
          tx.appointment.create({
            data: {
              tenantId: user.tenantId,
              patientId: dto.patientId,
              providerId: dto.providerId,
              startsAt: dto.startsAt,
              endsAt: dto.endsAt,
              type: dto.type ?? AppointmentType.CONSULT,
              reason: dto.reason,
              notes: dto.notes,
            },
          }),
        );
      },
    );
    void this.webhooks.fire(
      user.tenantId,
      'appointment.created',
      this.webhookPayload(created),
    );
    return created;
  }

  async list(filter: AppointmentRangeDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      return tx.appointment.findMany({
        where: {
          deletedAt: null,
          ...(filter.from || filter.to
            ? {
                startsAt: {
                  ...(filter.from ? { gte: filter.from } : {}),
                  ...(filter.to ? { lte: filter.to } : {}),
                },
              }
            : {}),
          ...(filter.providerId ? { providerId: filter.providerId } : {}),
          ...(filter.patientId ? { patientId: filter.patientId } : {}),
          ...(filter.status ? { status: filter.status } : {}),
        },
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
          consultation: { select: { id: true, status: true } },
        },
        orderBy: { startsAt: 'asc' },
        take: 200,
      });
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id, deletedAt: null },
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
          consultation: { select: { id: true, status: true } },
        },
      });
      if (!appt) throw new NotFoundException(`Appointment ${id} not found`);
      return appt;
    });
  }

  // ── transitions ─────────────────────────────────

  /**
   * Move an appointment to `to` if the state machine allows it. 409 on an
   * illegal move (e.g. completing a cancelled slot) so clients can tell
   * "someone else changed it" from "not found".
   */
  async transition(
    id: string,
    to: AppointmentStatus,
    user: AuthenticatedUser,
    extra: { cancelReason?: string } = {},
  ) {
    const updated = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      (tx) => this.transitionInTx(tx, id, to, extra),
    );
    this.fireTransitionWebhook(user.tenantId, updated, to);
    return updated;
  }

  /**
   * Same as `transition` but for callers that already hold a tenant
   * transaction (ConsultationsService opening / closing a consult). Keeps
   * the appointment and consult writes atomic.
   */
  async transitionInTx(
    tx: PrismaClient,
    id: string,
    to: AppointmentStatus,
    extra: { cancelReason?: string } = {},
  ) {
    const existing = await tx.appointment.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException(`Appointment ${id} not found`);
    try {
      assertTransition(existing.status, to);
    } catch (err) {
      if (err instanceof IllegalTransitionError)
        throw new ConflictException(err.message);
      throw err;
    }
    return tx.appointment.update({
      where: { id },
      data: {
        ...transitionData(to),
        ...(to === AppointmentStatus.CANCELLED && extra.cancelReason
          ? { cancelReason: extra.cancelReason }
          : {}),
      },
      include: { consultation: { select: { id: true, status: true } } },
    });
  }

  async checkIn(id: string, user: AuthenticatedUser) {
    return this.transition(id, AppointmentStatus.CHECKED_IN, user);
  }

  async complete(id: string, user: AuthenticatedUser) {
    return this.transition(id, AppointmentStatus.COMPLETED, user);
  }

  async noShow(id: string, user: AuthenticatedUser) {
    return this.transition(id, AppointmentStatus.NO_SHOW, user);
  }

  async cancel(
    id: string,
    user: AuthenticatedUser,
    dto: CancelAppointmentDto = {},
  ) {
    return this.transition(id, AppointmentStatus.CANCELLED, user, {
      cancelReason: dto.reason,
    });
  }

  /**
   * Move a live (or no-show) appointment to a new slot, optionally a new
   * provider. Lands on SCHEDULED with the reminder re-armed. Tells the
   * patient (email + SMS, best effort).
   */
  async reschedule(
    id: string,
    dto: RescheduleAppointmentDto,
    user: AuthenticatedUser,
  ) {
    if (dto.endsAt <= dto.startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    const { updated, previousStartsAt } = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      async (tx) => {
        const existing = await tx.appointment.findFirst({
          where: { id, deletedAt: null },
          select: { id: true, status: true, providerId: true, startsAt: true },
        });
        if (!existing)
          throw new NotFoundException(`Appointment ${id} not found`);
        if (!RESCHEDULABLE.includes(existing.status)) {
          throw new ConflictException(
            `cannot reschedule an appointment that is ${existing.status}`,
          );
        }
        const providerId = dto.providerId ?? existing.providerId;
        await this.assertSlotFree(
          tx,
          providerId,
          dto.startsAt,
          dto.endsAt,
          existing.id,
        );
        const updated = await this.catchOverlap(() =>
          tx.appointment.update({
            where: { id },
            data: {
              providerId,
              startsAt: dto.startsAt,
              endsAt: dto.endsAt,
              status: AppointmentStatus.SCHEDULED,
              // A fresh slot deserves a fresh reminder and a clean slate on
              // the check-in / no-show marks from the old one.
              reminderSentAt: null,
              checkedInAt: null,
              noShowAt: null,
              rescheduledFromStartsAt: existing.startsAt,
            },
            include: {
              patient: {
                select: { firstName: true, email: true, phone: true },
              },
              consultation: { select: { id: true, status: true } },
            },
          }),
        );
        return { updated, previousStartsAt: existing.startsAt };
      },
    );

    const when = updated.startsAt.toLocaleString();
    if (updated.patient.email) {
      void this.mailer.send({
        to: updated.patient.email,
        subject: 'Your ClinIQ appointment was rescheduled',
        text:
          `Hi ${updated.patient.firstName},\n\n` +
          `Your appointment originally on ${previousStartsAt.toLocaleString()} ` +
          `has been moved to ${when}.\n\n` +
          `If that doesn't work for you, please contact your clinic.\n`,
      });
    }
    if (updated.patient.phone) {
      void this.sms.send({
        to: updated.patient.phone,
        body: `ClinIQ: Hi ${updated.patient.firstName}, your appt was moved to ${when}. Contact your clinic if needed.`,
      });
    }
    void this.webhooks.fire(user.tenantId, 'appointment.rescheduled', {
      ...this.webhookPayload(updated),
      previousStartsAt: previousStartsAt.toISOString(),
    });
    // Don't echo the patient's contact details back on a scheduling call.
    const body: Partial<typeof updated> = { ...updated };
    delete body.patient;
    return body;
  }

  // ── helpers ───────────────────────────────────────

  /** Service-level overlap check → friendly 409 before the DB constraint. */
  private async assertSlotFree(
    tx: PrismaClient,
    providerId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
  ) {
    const clash = await tx.appointment.findFirst({
      where: overlapWhere(providerId, startsAt, endsAt, excludeId),
      select: { id: true, startsAt: true, endsAt: true },
    });
    if (clash) {
      throw new ConflictException({
        message: `provider already has an appointment ${clash.startsAt.toISOString()} – ${clash.endsAt.toISOString()}`,
        conflictingAppointmentId: clash.id,
      });
    }
  }

  /**
   * The DB exclusion constraint (`appointments_provider_no_overlap`) catches
   * the race two concurrent bookings can win past `assertSlotFree`. Prisma
   * surfaces it as a generic error carrying the Postgres 23P01 code; turn it
   * into the same 409 the pre-check gives.
   */
  private async catchOverlap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const e = err as {
        code?: string;
        meta?: { code?: string };
        message?: string;
      };
      const pgCode = e.meta?.code ?? e.code;
      if (
        pgCode === '23P01' ||
        /appointments_provider_no_overlap/.test(e.message ?? '')
      ) {
        throw new ConflictException(
          'provider already has an appointment in that slot',
        );
      }
      throw err;
    }
  }

  private fireTransitionWebhook(
    tenantId: string,
    appt: {
      id: string;
      patientId: string;
      providerId: string;
      startsAt: Date;
      endsAt: Date;
      type: AppointmentType;
      status: AppointmentStatus;
      reason: string | null;
    },
    to: AppointmentStatus,
  ) {
    const event = (
      {
        CHECKED_IN: 'appointment.checked_in',
        IN_PROGRESS: 'appointment.started',
        COMPLETED: 'appointment.completed',
        CANCELLED: 'appointment.cancelled',
        NO_SHOW: 'appointment.no_show',
        SCHEDULED: null,
      } as const
    )[to];
    if (event)
      void this.webhooks.fire(tenantId, event, this.webhookPayload(appt));
  }

  private webhookPayload(appt: {
    id: string;
    patientId: string;
    providerId: string;
    startsAt: Date;
    endsAt: Date;
    type: AppointmentType;
    status: AppointmentStatus;
    reason: string | null;
  }) {
    return {
      id: appt.id,
      patientId: appt.patientId,
      providerId: appt.providerId,
      startsAt: appt.startsAt.toISOString(),
      endsAt: appt.endsAt.toISOString(),
      type: appt.type,
      status: appt.status,
      reason: appt.reason,
    };
  }
}
