import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationKind, NotificationSeverity, PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AcknowledgeCriticalResultDto } from './dto/critical-results.dto.js';

/**
 * The critical-result call-back queue.
 *
 * A critical value is not handled when it is written to the chart; it is
 * handled when a clinician has been told and has said so. This service owns
 * the second half: the queue of results awaiting acknowledgement, the
 * acknowledgement itself (with read-back), and the sweep that escalates the
 * ones nobody answered.
 */
@Injectable()
export class CriticalResultsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CriticalResultsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly sweepEnabled: boolean;
  private readonly sweepIntervalMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationsService,
    private readonly config: ConfigService,
  ) {
    this.sweepEnabled =
      (this.config.get<string>('CRITICAL_ESCALATION_ENABLED') ?? 'false') ===
      'true';
    this.sweepIntervalMs =
      Number(this.config.get<string>('CRITICAL_ESCALATION_INTERVAL_MS')) ||
      5 * 60_000;
  }

  onModuleInit(): void {
    if (!this.sweepEnabled) {
      this.logger.log(
        'critical-result escalation disabled (set CRITICAL_ESCALATION_ENABLED=true)',
      );
      return;
    }
    this.timer = setInterval(() => {
      void this.escalateOverdue().catch((err) =>
        this.logger.warn(
          `critical escalation sweep failed: ${(err as Error).message}`,
        ),
      );
    }, this.sweepIntervalMs);
    this.logger.log(
      `critical-result escalation every ${this.sweepIntervalMs}ms`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * The queue. Unacknowledged first and oldest-due first, because that is the
   * order someone working the queue should pick them up in.
   */
  list(user: AuthenticatedUser, opts: { includeAcknowledged?: boolean } = {}) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.criticalResultNotification.findMany({
        where: opts.includeAcknowledged ? {} : { acknowledgedAt: null },
        orderBy: [{ acknowledgedAt: 'asc' }, { dueAt: 'asc' }],
        take: 200,
      }),
    );
  }

  /**
   * Acknowledge a critical result.
   *
   * Deliberately NOT restricted to the recipient. When a lab telephones a
   * critical potassium the person who takes the call is whoever is covering,
   * and refusing their acknowledgement because the order names a different
   * doctor would leave the queue permanently red. Who actually acknowledged
   * is recorded, which is the thing that matters.
   *
   * Acknowledging twice is refused rather than silently overwritten — the
   * first read-back is the one that happened.
   */
  async acknowledge(
    id: string,
    dto: AcknowledgeCriticalResultDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.criticalResultNotification.findFirst({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException(
          `Critical result notification ${id} not found`,
        );
      }
      if (existing.acknowledgedAt) {
        throw new BadRequestException(
          `Already acknowledged at ${existing.acknowledgedAt.toISOString()}`,
        );
      }
      return tx.criticalResultNotification.update({
        where: { id },
        data: {
          acknowledgedAt: new Date(),
          acknowledgedByUserId: user.userId,
          acknowledgementNote: dto.note ?? null,
          ...(dto.method ? { method: dto.method } : {}),
        },
      });
    });
  }

  /**
   * Escalate critical results nobody acknowledged before they came due.
   *
   * Escalation here means telling the tenant's owners and admins, once, and
   * stamping `escalatedAt` so it does not repeat every five minutes. The row
   * stays unacknowledged and stays in the queue — escalating is not closing.
   *
   * Runs across tenants, so it uses the platform context; this is the same
   * shape as the retention sweep.
   */
  async escalateOverdue(): Promise<{ escalated: number }> {
    const now = new Date();
    const due = await this.prisma.withPlatformContext((tx) =>
      tx.criticalResultNotification.findMany({
        where: { acknowledgedAt: null, escalatedAt: null, dueAt: { lt: now } },
        orderBy: { dueAt: 'asc' },
        take: 200,
      }),
    );
    if (due.length === 0) return { escalated: 0 };

    let escalated = 0;
    for (const row of due) {
      try {
        await this.notif.notifyRoles(row.tenantId, ['OWNER', 'ADMIN'], {
          kind: NotificationKind.LAB_CRITICAL_UNACKNOWLEDGED,
          severity: NotificationSeverity.CRITICAL,
          title: `Unacknowledged critical result: ${row.testName}`,
          body: `${row.resultValue}${row.resultUnit ? ` ${row.resultUnit}` : ''} (${row.flag}) has not been acknowledged since ${row.dueAt.toISOString()}`,
          link: `/patients/${row.patientId}`,
          entityId: row.id,
        });
        await this.prisma.withTenant(row.tenantId, null, (tx) =>
          tx.criticalResultNotification.update({
            where: { id: row.id },
            data: { escalatedAt: new Date() },
          }),
        );
        escalated += 1;
      } catch (err) {
        // One tenant's failure must not abort the sweep; leaving escalatedAt
        // null means the next pass retries it.
        this.logger.error(
          `escalation failed for ${row.id}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.warn(`escalated ${escalated} unacknowledged critical results`);
    return { escalated };
  }
}
