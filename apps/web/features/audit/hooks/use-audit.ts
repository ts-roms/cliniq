'use client';

import { useQuery } from '@tanstack/react-query';
import { auditControllerList } from '@org/api-client';
import type { AuditFilter, AuditListResult } from '../schemas/audit';

export const auditKeys = {
  list: (f: AuditFilter) => ['audit', 'list', f] as const,
};

export function useAuditList(filter: AuditFilter) {
  return useQuery({
    queryKey: auditKeys.list(filter),
    queryFn: async (): Promise<AuditListResult> => {
      const { data, error } = await auditControllerList({
        query: {
          action: filter.action || undefined,
          entityType: filter.entityType || undefined,
          entityId: filter.entityId || undefined,
          userId: filter.userId || undefined,
          since: filter.since || undefined,
          until: filter.until || undefined,
          limit: filter.limit ?? 50,
          cursor: filter.cursor ?? 0,
        },
      });
      if (error || !data) throw new Error('Failed to load audit log');
      return data as unknown as AuditListResult;
    },
    placeholderData: (prev) => prev,
  });
}
