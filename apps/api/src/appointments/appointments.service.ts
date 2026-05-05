import {
  BadRequestException,
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

@Injectable()
export class AppointmentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppointmentsService.name);
  private readonly reminderEnabled: boolean;
  private readonly reminderIntervalMs: number;
  private readonly reminderLeadMinutes: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly sms: SmsService,
    private readonly notif: NotificationsService,
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
  ) {
    this.reminderEnabled = (this.config.get<string>('APPT_REMINDERS_ENABLED') ?? 'false') === 'true';
    this.reminderIntervalMs = Number(this.config.get<string>('APPT_REMINDER_INTERVAL_MS') ?? 5 * 60_000);
    this.reminderLeadMinutes = Number(this.config.get<string>('APPT_REMINDER_LEAD_MINUTES') ?? 60);
  }

  // ── reminder loop ─────────────────────────────────
  onModuleInit(): void {
    if (!this.reminderEnabled) {
      this.logger.log('appointment reminders disabled (set APPT_REMINDERS_ENABLED=true)');
      return;
    }
    this.timer = setInterval(() => {
      void this.sendDueReminders().catch((err) =>
        this.logger.warn(`reminder sweep failed: ${(err as Error).message}`),
      );
    }, this.reminderIntervalMs);
    this.logger.log(`appointment reminders scheduled every ${this.reminderIntervalMs / 1000}s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Manually triggerable for tests + CI smoke. Returns count of reminders fired. */
  async sendDueReminders(): Promise<number> {
    const now = Date.now();
    const windowEnd = new Date(now + this.reminderLeadMinutes * 60_000);
    const windowStart = new Date(now);

    const due = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.SCHEDULED,
        reminderSentAt: null,
        startsAt: { gte: windowStart, lte: windowEnd },
        deletedAt: null,
      },
      include: {
        patient: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
      take: 200,
    });

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
      await this.prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSentAt: new Date() },
      });
      count++;
    }
    if (count > 0) this.logger.log(`sent ${count} appointment reminder(s)`);
    return count;
  }

  // ── CRUD ─────────────────────────────────────────
  async create(dto: CreateAppointmentDto, user: AuthenticatedUser) {
    if (dto.endsAt <= dto.startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    const created = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException(`Patient ${dto.patientId} not found`);
      return tx.appointment.create({
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
      });
    });
    void this.webhooks.fire(user.tenantId, 'appointment.created', {
      id: created.id,
      patientId: created.patientId,
      providerId: created.providerId,
      startsAt: created.startsAt.toISOString(),
      endsAt: created.endsAt.toISOString(),
      type: created.type,
      status: created.status,
      reason: created.reason,
    });
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
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
        },
        orderBy: { startsAt: 'asc' },
        take: 200,
      });
    });
  }

  async setStatus(id: string, status: AppointmentStatus, user: AuthenticatedUser) {
    const updated = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.appointment.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException(`Appointment ${id} not found`);
      return tx.appointment.update({ where: { id }, data: { status } });
    });
    if (status === AppointmentStatus.CHECKED_IN) {
      void this.webhooks.fire(user.tenantId, 'appointment.checked_in', {
        id: updated.id,
        patientId: updated.patientId,
        providerId: updated.providerId,
        startsAt: updated.startsAt.toISOString(),
      });
    } else if (status === AppointmentStatus.CANCELLED) {
      void this.webhooks.fire(user.tenantId, 'appointment.cancelled', {
        id: updated.id,
        patientId: updated.patientId,
        providerId: updated.providerId,
        startsAt: updated.startsAt.toISOString(),
      });
    }
    return updated;
  }

  async cancel(id: string, user: AuthenticatedUser) {
    return this.setStatus(id, AppointmentStatus.CANCELLED, user);
  }
}
