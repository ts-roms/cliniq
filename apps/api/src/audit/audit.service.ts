import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@org/db';

export interface AuditEntry {
  tenantId?: string | null;
  userId?: string | null;
  /** When the action ran under a delegation, the delegator's user id. */
  onBehalfOfUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
  /** What changed, as [{field, before, after}]. Already redacted. */
  changes?: ReadonlyArray<{ field: string; before: unknown; after: unknown }>;
  /** The stated reason, where the request carried one. */
  reason?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append an audit entry. Never throws — audit failures must not break the
   * primary action. We log the error so it shows up in CloudWatch and metrics.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      // audit_logs_insert_self_tenant policy:
      //   WITH CHECK ("tenantId" IS NULL OR "tenantId" = current_tenant_id())
      // → null tenantId (system events: login, register, platform) passes
      // without any GUC; non-null requires current_tenant set to the same id.
      //
      // createMany, not create: Prisma's create appends RETURNING, and
      // Postgres checks RETURNING rows against the SELECT policy too — which
      // a null-tenant row can never satisfy, so every login/register audit
      // was failing with "new row violates row-level security policy".
      const data = {
        tenantId: entry.tenantId ?? null,
        userId: entry.userId ?? null,
        onBehalfOfUserId: entry.onBehalfOfUserId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        metadata: (entry.metadata ?? null) as never,
        reason: entry.reason ?? null,
        // OMITTED, not null, when there is nothing to record.
        //
        // Handing JS `null` to a Prisma `Json?` field writes JSON `null`
        // ('null'::jsonb), not SQL NULL — so `changes IS NULL` is false and
        // jsonb_typeof() returns 'null'. The CHECK constraint added with this
        // column caught that immediately: every audit row without changes
        // failed to write, which is every login, register and create. The
        // failure was swallowed by the catch below, as it is designed to be,
        // so nothing surfaced except the rows quietly not being there.
        //
        // Leaving the key out lets the column default to a real SQL NULL.
        ...(entry.changes?.length ? { changes: entry.changes as never } : {}),
      };
      if (entry.tenantId) {
        await this.prisma.withTenant(
          entry.tenantId,
          entry.userId ?? null,
          (tx) => tx.auditLog.createMany({ data: [data] }),
        );
      } else {
        await this.prisma.auditLog.createMany({ data: [data] });
      }
    } catch (err) {
      this.logger.error(
        `audit write failed for action=${entry.action} tenant=${entry.tenantId ?? '-'} user=${entry.userId ?? '-'}: ${(err as Error).message}`,
      );
    }
  }
}
