'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
} from '@org/ui';
import {
  InvoiceStatusPill,
  useClinicInvoices,
  type LabInvoiceStatus,
} from '@/features/lab';

const STATUSES: LabInvoiceStatus[] = ['ISSUED', 'OVERDUE', 'PAID', 'VOID'];

function formatMoney(cents: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
  return formatter.format(cents / 100);
}

export default function ClinicLabInvoicesPage() {
  const [status, setStatus] = useState<LabInvoiceStatus | 'all'>('all');
  const { data, isLoading, error } = useClinicInvoices({
    status: status === 'all' ? undefined : status,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lab invoices</h1>
        <p className="text-sm text-muted-foreground">
          Invoices issued by associated labs for cases your clinic placed.
        </p>
      </div>

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
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          )}
          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Ref</th>
                    <th className="py-2 pr-3">Lab</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3 text-right">Paid</th>
                    <th className="py-2 pr-3">Due</th>
                    <th className="py-2 pr-3">Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((inv) => (
                    <tr key={inv.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 pr-3 font-mono text-xs">
                        <Link
                          href={`/lab-invoices/${inv.id}`}
                          className="text-primary hover:underline"
                        >
                          {inv.refNumber !== null ? `INV-${inv.refNumber}` : '—'}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{inv.lab?.name ?? '—'}</td>
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
                        {inv.issuedAt
                          ? new Date(inv.issuedAt).toLocaleDateString()
                          : '—'}
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
