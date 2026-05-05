export interface AuditLogEntry {
  id: string;
  tenantId: string | null;
  userId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export interface AuditListResult {
  items: AuditLogEntry[];
  total: number;
  limit: number;
  cursor: number;
  nextCursor: number | null;
}

export interface AuditFilter {
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  since?: string;
  until?: string;
  limit?: number;
  cursor?: number;
}
