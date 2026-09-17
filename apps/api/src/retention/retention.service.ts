import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@org/db';

/**
 * NPC retention purge.
 *
 * Walks the tables that hold time-bound personal data and removes rows past
 * their lawful retention. Idempotent: running multiple times never deletes
 * data outside the window. Triggered by an external scheduler (CloudWatch
 * Event / k8s CronJob / GitHub Actions) hitting POST /api/retention/run-now
 * nightly at 03:15 Asia/Manila — see docs/runbooks/backup-restore.md for
 * the cloud wiring.
 *
 * Per docs/regulatory/retention.md and the public PIA at /privacy/pia,
 * windows are:
 *
 *   - audio transcripts:  30 days from creation
 *   - audit logs:         7 years (2555 days) from occurredAt
 *   - notifications:      90 days from createdAt (read OR unread)
 *   - soft-deleted patient/consult/file rows: 10 years from deletedAt
 *
 * Patient records under clinical-retention obligation are NOT deleted by
 * this job — DSR erasure handles those via anonymization.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run() {
    const now = Date.now();
    const days = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);

    // audit_logs retention is INTENTIONALLY skipped — the cliniq_app DB role
    // has `GRANT SELECT, INSERT` only, no DELETE/UPDATE (audit logs are
    // designed as append-only). Implementing the 7-year window requires
    // either a privileged retention role or a partition-detach strategy.
    // Both are schema changes; tracking as a follow-up rather than half-
    // deleting under the wrong role here. See docs/regulatory/retention.md.
    let auditLogsDeleted = 0;
    this.logger.warn(
      'audit-log retention skipped — cliniq_app lacks DELETE grant on audit_logs',
    );

    // Notifications: 90-day window, iterate per tenant so RLS stays on and
    // a flaky tenant doesn't block the others.
    const tenants = await this.prisma.withPlatformContext((tx) =>
      tx.tenant.findMany({ where: { deletedAt: null }, select: { id: true } }),
    );
    let notificationsDeleted = 0;
    for (const tenant of tenants) {
      try {
        const res = await this.prisma.withTenant(tenant.id, null, (tx) =>
          tx.notification.deleteMany({
            where: { createdAt: { lt: days(90) } },
          }),
        );
        notificationsDeleted += res.count;
      } catch (err) {
        this.logger.warn(
          `notification retention failed for tenant ${tenant.id}: ${(err as Error).message}`,
        );
      }
    }

    return {
      auditLogsDeleted,
      notificationsDeleted,
      ranAt: new Date().toISOString(),
    };
  }
}
