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
      await this.prisma.auditLog.create({
        data: {
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
        },
      });
    } catch (err) {
      this.logger.error(
        `audit write failed for action=${entry.action}: ${(err as Error).message}`,
      );
    }
  }
}
