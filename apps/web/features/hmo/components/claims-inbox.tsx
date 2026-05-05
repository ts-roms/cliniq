'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatCentavos } from '@/features/billing';
import type { ClaimStatus, HmoClaim } from '../schemas/hmo';
import { useClaims } from '../hooks/use-hmo';
import { ClaimActions } from './claim-detail-dialog';

const STATUS_TONE: Record<ClaimStatus, string> = {
  DRAFT: 'bg-zinc-200 text-zinc-700',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  DENIED: 'bg-rose-100 text-rose-800',
  PAID: 'bg-emerald-200 text-emerald-900 font-semibold',
  CANCELLED: 'bg-zinc-300 text-zinc-700 line-through',
};

const FILTERS = [
  'ALL',
  'SUBMITTED',
  'APPROVED',
  'PARTIAL',
  'DENIED',
  'PAID',
] as const;
type Filter = (typeof FILTERS)[number];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export function ClaimsInbox() {
  const [filter, setFilter] = useState<Filter>('SUBMITTED');
  const { data, isLoading, error } = useClaims();

  const visible = useMemo(() => {
    if (!data) return [];
    if (filter === 'ALL') return data;
    return data.filter((c) => c.status === filter);
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
            {f}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data && visible.length === 0 && (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No claims in this view.
        </p>
      )}
      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[860px]">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Claim #</th>
                <th className="px-4 py-2">Patient</th>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Claimed</th>
                <th className="px-4 py-2 text-right">Approved</th>
                <th className="px-4 py-2">Submitted</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((claim) => (
                <ClaimRow key={claim.id} claim={claim} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClaimRow({ claim }: { claim: HmoClaim }) {
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-4 py-3 font-mono text-xs">
        {claim.number}
        {claim.invoice && (
          <Link
            href={`/patients/${claim.patientId}`}
            className="block text-xs text-primary hover:underline"
          >
            ↳ {claim.invoice.number}
          </Link>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {claim.patient
          ? `${claim.patient.lastName}, ${claim.patient.firstName}`
          : claim.patientId}
        {claim.patient && (
          <p className="text-xs text-muted-foreground">{claim.patient.mrn}</p>
        )}
      </td>
      <td className="px-4 py-3 text-sm">{claim.provider?.name ?? claim.providerId}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[claim.status]}`}>
          {claim.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">
        {formatCentavos(claim.claimedCentavos)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">
        {formatCentavos(claim.approvedCentavos)}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {formatDate(claim.submittedAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <ClaimActions claim={claim} />
      </td>
    </tr>
  );
}
