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
      // → null tenantId (system events) passes without any GUC; non-null
      // requires current_tenant set to the same id. Branch on the input.
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
      };
      if (entry.tenantId) {
        await this.prisma.withTenant(entry.tenantId, entry.userId ?? null, (tx) =>
          tx.auditLog.create({ data }),
        );
      } else {
        await this.prisma.auditLog.create({ data });
      }
    } catch (err) {
      this.logger.error(
        `audit write failed for action=${entry.action}: ${(err as Error).message}`,
      );
    }
  }
}
