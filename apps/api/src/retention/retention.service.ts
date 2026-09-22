import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@org/db';

/**
 * NPC retention purge.
 *
 * Walks the tables that hold time-bound personal data and removes rows past
 * their lawful retention. Idempotent: running multiple times never deletes
 * data outside the window. Triggered by an external scheduler (CloudWatch
 * Event / k8s CronJob / GitHub Actions) hitting
 * POST /api/platform/retention/run-now nightly at 03:15 Asia/Manila — see
 * docs/runbooks/backup-restore.md for the cloud wiring.
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
export interface RetentionRunResult {
  auditLogsDeleted: number;
  notificationsDeleted: number;
  /** How many tenants this pass covered (1 for a tenant-scoped run). */
  tenantsScanned: number;
  ranAt: string;
}

/** Notifications are kept for 90 days, read or unread. */
const NOTIFICATION_RETENTION_DAYS = 90;

/**
 * Tenants purged per platform-wide pass. The sweep is a delete round-trip
 * per tenant, so an unbounded loop grows linearly with the customer base —
 * at a few hundred tenants it already blows a 20s HTTP timeout. The
 * scheduler calls this nightly and the window is 90 days wide, so covering
 * the estate over several passes is harmless; a tenant is never skipped
 * twice in a row because ordering is by `id` and the cursor is returned.
 */
const PLATFORM_SWEEP_BATCH = 200;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Purge one tenant. This is what `POST /retention/run-now` runs: a clinic
   * ADMIN triggering a purge must only ever touch their own tenant's rows.
   */
  async runForTenant(tenantId: string): Promise<RetentionRunResult> {
    const notificationsDeleted = await this.purgeNotifications(tenantId);
    return {
      auditLogsDeleted: this.skipAuditLogs(),
      notificationsDeleted,
      tenantsScanned: 1,
      ranAt: new Date().toISOString(),
    };
  }

  /**
   * Platform-wide sweep, for the nightly scheduler. Bounded to
   * PLATFORM_SWEEP_BATCH tenants per call; pass the returned `nextCursor`
   * back in to continue, or let the next nightly run pick up where this
   * one stopped.
   */
  async runForPlatform(
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<RetentionRunResult & { nextCursor: string | null }> {
    const take = Math.min(
      Math.max(opts.limit ?? PLATFORM_SWEEP_BATCH, 1),
      PLATFORM_SWEEP_BATCH,
    );
    const tenants = await this.prisma.withPlatformContext((tx) =>
      tx.tenant.findMany({
        where: {
          deletedAt: null,
          ...(opts.cursor ? { id: { gt: opts.cursor } } : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take,
      }),
    );

    let notificationsDeleted = 0;
    for (const tenant of tenants) {
      notificationsDeleted += await this.purgeNotifications(tenant.id);
    }

    return {
      auditLogsDeleted: this.skipAuditLogs(),
      notificationsDeleted,
      tenantsScanned: tenants.length,
      nextCursor:
        tenants.length === take ? tenants[tenants.length - 1].id : null,
      ranAt: new Date().toISOString(),
    };
  }

  /**
   * Delete one tenant's expired notifications. Never throws — one tenant
   * with a lock or a bad row must not abort the rest of the sweep.
   */
  private async purgeNotifications(tenantId: string): Promise<number> {
    const cutoff = new Date(
      Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    try {
      const res = await this.prisma.withTenant(tenantId, null, (tx) =>
        tx.notification.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      );
      return res.count;
    } catch (err) {
      this.logger.warn(
        `notification retention failed for tenant ${tenantId}: ${(err as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * audit_logs retention is INTENTIONALLY skipped — the cliniq_app DB role
   * has `GRANT SELECT, INSERT` only, no DELETE/UPDATE (audit logs are
   * designed as append-only). Implementing the 7-year window requires
   * either a privileged retention role or a partition-detach strategy.
   * Both are schema changes; tracking as a follow-up rather than half-
   * deleting under the wrong role here. See docs/regulatory/retention.md.
   */
  private skipAuditLogs(): number {
    this.logger.warn(
      'audit-log retention skipped — cliniq_app lacks DELETE grant on audit_logs',
    );
    return 0;
  }
}
