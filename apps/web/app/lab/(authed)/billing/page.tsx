'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
} from '@org/ui';
import {
  InvoiceStatusPill,
  useLabClinicLinks,
  useLabInvoices,
  useGenerateInvoiceFromCases,
  useLabCases,
  useRunMonthlyInvoiceSweep,
  type LabInvoiceStatus,
} from '@/features/lab';

const STATUSES: LabInvoiceStatus[] = ['DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'VOID'];

function formatMoney(cents: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
  return formatter.format(cents / 100);
}

export default function LabBillingPage() {
  const [status, setStatus] = useState<LabInvoiceStatus | 'all'>('all');
  const { data, isLoading, error } = useLabInvoices({
    status: status === 'all' ? undefined : status,
  });
  const [showGenerator, setShowGenerator] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Invoices for delivered cases. Generate from completed cases or
            compose a draft from scratch.
          </p>
        </div>
        <div className="flex gap-2">
          <SweepLastMonthButton />
          <Button onClick={() => setShowGenerator((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            {showGenerator ? 'Cancel' : 'Generate from cases'}
          </Button>
        </div>
      </div>

      {showGenerator && (
        <GenerateFromCases onDone={() => setShowGenerator(false)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Invoices</span>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as LabInvoiceStatus | 'all')}
              className="w-44"
            >
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          {!isLoading && data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No invoices match this filter.
            </p>
          )}
          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Ref</th>
                    <th className="py-2 pr-3">Clinic</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3 text-right">Paid</th>
                    <th className="py-2 pr-3">Due</th>
                    <th className="py-2 pr-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((inv) => (
                    <tr key={inv.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 pr-3 font-mono text-xs">
                        <Link
                          href={`/lab/billing/${inv.id}`}
                          className="text-primary hover:underline"
                        >
                          {inv.refNumber !== null ? `INV-${inv.refNumber}` : 'Draft'}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{inv.clinic?.name ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <InvoiceStatusPill status={inv.status} />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatMoney(inv.totalCents, inv.currency)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatMoney(inv.paidCents, inv.currency)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SweepLastMonthButton() {
  const sweep = useRunMonthlyInvoiceSweep();
  const [feedback, setFeedback] = useState<string | null>(null);
  function run() {
    setFeedback(null);
    sweep.mutate(undefined, {
      onSuccess: (res) => {
        setFeedback(
          res.invoicesCreated === 0
            ? `No new cases to bill for ${res.period}.`
            : `Created ${res.invoicesCreated} draft invoice${res.invoicesCreated === 1 ? '' : 's'} for ${res.period}.`,
        );
      },
      onError: (e: unknown) => setFeedback((e as Error).message),
    });
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={run} disabled={sweep.isPending}>
        {sweep.isPending ? 'Running…' : 'Sweep last month'}
      </Button>
      {feedback && (
        <span className="text-[11px] text-muted-foreground">{feedback}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Generator: pick a clinic, then check off DELIVERED cases to bill.
// Auto-creates a DRAFT invoice the lab can then edit + issue.
// ─────────────────────────────────────────────────────────────────
function GenerateFromCases({ onDone }: { onDone: () => void }) {
  const { data: links } = useLabClinicLinks();
  const activeLinks = useMemo(
    () => (links ?? []).filter((l) => l.status === 'ACTIVE'),
    [links],
  );
  const [clinicId, setClinicId] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueAt, setDueAt] = useState('');
  const [taxCents, setTaxCents] = useState('0');
  const generate = useGenerateInvoiceFromCases();

  const { data: cases } = useLabCases({ status: 'DELIVERED' });
  const candidate = useMemo(
    () => (cases ?? []).filter((c) => c.clinicTenantId === clinicId),
    [cases, clinicId],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (!clinicId || selected.size === 0) return;
    generate.mutate(
      {
        clinicTenantId: clinicId,
        caseIds: [...selected],
        dueAt: dueAt || undefined,
        taxCents: Number(taxCents) || 0,
      },
      { onSuccess: () => onDone() },
    );
  }

  const total = candidate
    .filter((c) => selected.has(c.id))
    .reduce((sum, c) => sum + (c.unitPrice ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate invoice from delivered cases</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Clinic
            </label>
            <Select
              value={clinicId}
              onChange={(e) => {
                setClinicId(e.target.value);
                setSelected(new Set());
              }}
            >
              <option value="">— Select clinic —</option>
              {activeLinks.map((l) => (
                <option key={l.clinicTenantId} value={l.clinicTenantId}>
                  {l.clinic?.name ?? l.clinicTenantId}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Due date (optional)
            </label>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Tax (centavos)
            </label>
            <input
              type="number"
              min={0}
              value={taxCents}
              onChange={(e) => setTaxCents(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>

        {clinicId && (
          <div className="rounded-md border">
            {candidate.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No delivered cases for this clinic.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-10 px-3 py-2"></th>
                    <th className="px-3 py-2">Ref</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Patient</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {candidate.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggle(c.id)}
                          aria-label={`Select case ${c.refNumber ?? c.id}`}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        #{c.refNumber ?? c.id.slice(-6)}
                      </td>
                      <td className="px-3 py-2">{c.product?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {c.patientLabel ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {c.unitPrice !== null
                          ? formatMoney(c.unitPrice, c.currency)
                          : <span className="text-amber-600">no price</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {generate.error && (
          <p className="text-sm text-destructive">
            {(generate.error as Error).message}
          </p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {selected.size} case{selected.size === 1 ? '' : 's'} selected — subtotal{' '}
            <span className="font-medium text-foreground tabular-nums">
              {formatMoney(total, 'PHP')}
            </span>
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onDone}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!clinicId || selected.size === 0 || generate.isPending}
            >
              {generate.isPending ? 'Generating…' : 'Generate draft'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
