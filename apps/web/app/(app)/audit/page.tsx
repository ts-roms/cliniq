'use client';

import { useState } from 'react';
import { useSession } from '@/features/auth';
import {
  AuditDetailDrawer,
  AuditFilters,
  AuditTable,
  useAuditList,
  type AuditFilter,
  type AuditLogEntry,
} from '@/features/audit';
import { AiBudgetCard } from '@/features/ai-budget';
import { Button } from '@org/ui';

const ALLOWED_ROLES = new Set(['OWNER', 'ADMIN']);

export default function AuditPage() {
  const session = useSession();
  const [filter, setFilter] = useState<AuditFilter>({ limit: 50, cursor: 0 });
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const { data, isLoading, error, isFetching } = useAuditList(filter);

  if (session && !ALLOWED_ROLES.has(session.user.role)) {
    return (
      <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-sm text-destructive">
          Audit log access is restricted to clinic owners and administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extralight tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} entries` : 'Loading…'}
            {isFetching && ' · refreshing'}
          </p>
        </div>
      </header>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <AiBudgetCard />
        </div>
      </div>

      <AuditFilters filter={filter} onChange={setFilter} />

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data && <AuditTable items={data.items} onSelect={setSelected} />}

      {data && data.nextCursor !== null && (
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            onClick={() => setFilter((f) => ({ ...f, cursor: data.nextCursor! }))}
          >
            Load more
          </Button>
        </div>
      )}

      <AuditDetailDrawer
        entry={selected}
        onClose={() => setSelected(null)}
        onApplyFilter={setFilter}
      />
    </div>
  );
}
