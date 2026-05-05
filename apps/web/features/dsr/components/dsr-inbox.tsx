'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Dsr, DsrStatus } from '../schemas/dsr';
import { useDsrList } from '../hooks/use-dsr';
import { ResolveDsrDialog } from './resolve-dsr-dialog';

const STATUS_TONE: Record<DsrStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
};

const FILTERS = ['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'] as const;
type Filter = (typeof FILTERS)[number];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DsrInbox() {
  const [filter, setFilter] = useState<Filter>('OPEN');
  const { data, isLoading, error } = useDsrList();

  const visible = useMemo(() => {
    if (!data) return [];
    if (filter === 'ALL') return data;
    return data.filter((d) => d.status === filter);
  }, [data, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data && visible.length === 0 && (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No requests in this view.
        </p>
      )}
      {visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((dsr) => (
            <DsrItem key={dsr.id} dsr={dsr} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DsrItem({ dsr }: { dsr: Dsr }) {
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700">
              {dsr.type}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[dsr.status]}`}
            >
              {dsr.status.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm">
            <Link
              href={`/patients/${dsr.patientId}`}
              className="text-primary hover:underline"
            >
              {dsr.patient
                ? `${dsr.patient.lastName}, ${dsr.patient.firstName} (${dsr.patient.mrn})`
                : dsr.patientId}
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">
            Filed {formatDate(dsr.filedAt)}
            {dsr.resolvedAt && ` · Resolved ${formatDate(dsr.resolvedAt)}`}
          </p>
          {dsr.details && (
            <p className="mt-2 rounded bg-muted/40 p-2 text-xs">{dsr.details}</p>
          )}
          {dsr.resolution && (
            <p className="mt-1 text-xs text-emerald-700">→ {dsr.resolution}</p>
          )}
        </div>
        <ResolveDsrDialog dsr={dsr} />
      </div>
    </li>
  );
}
