'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import {
  InvoiceStatusPill,
  useClinicInvoice,
  useGetClinicInvoicePdf,
} from '@/features/lab';

function formatMoney(cents: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
  return formatter.format(cents / 100);
}

export default function ClinicLabInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params?.id ?? null;
  const { data: invoice, isLoading, error } = useClinicInvoice(invoiceId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!invoice) return null;

  const outstanding = invoice.totalCents - invoice.paidCents;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/lab-invoices"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to invoices
        </Link>
        <ClinicDownloadPdfButton id={invoice.id} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-3">
              <span className="font-mono text-base">
                {invoice.refNumber !== null ? `INV-${invoice.refNumber}` : '—'}
              </span>
              <InvoiceStatusPill status={invoice.status} />
            </span>
            <span className="text-sm text-muted-foreground">
              From {invoice.lab?.name}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 text-sm md:grid-cols-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Subtotal</div>
              <div className="tabular-nums">
                {formatMoney(invoice.subtotalCents, invoice.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Tax</div>
              <div className="tabular-nums">
                {formatMoney(invoice.taxCents, invoice.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Total</div>
              <div className="text-lg font-semibold tabular-nums">
                {formatMoney(invoice.totalCents, invoice.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Outstanding</div>
              <div className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {formatMoney(outstanding, invoice.currency)}
              </div>
            </div>
          </div>

          <div className="grid gap-3 text-sm md:grid-cols-3">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Issued</div>
              <div>
                {invoice.issuedAt
                  ? new Date(invoice.issuedAt).toLocaleString()
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Due</div>
              <div>
                {invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Paid</div>
              <div>
                {invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : '—'}
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div>
              <div className="text-xs uppercase text-muted-foreground">Notes</div>
              <p className="whitespace-pre-wrap text-sm">{invoice.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No line items.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3 text-right">Qty</th>
                    <th className="py-2 pr-3 text-right">Unit</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((it) => (
                    <tr key={it.id} className="border-b">
                      <td className="py-2 pr-3">
                        {it.description}
                        {it.caseId && (
                          <Link
                            href={`/lab-cases/${it.caseId}`}
                            className="ml-2 text-xs text-primary hover:underline"
                          >
                            view case
                          </Link>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{it.qty}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatMoney(it.unitPriceCents, invoice.currency)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatMoney(it.amountCents, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {invoice.paymentLinks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pay this invoice</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {invoice.paymentLinks
                .filter((l) => l.status === 'PENDING')
                .map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm font-medium">
                        {l.provider} · {formatMoney(l.amountCents, invoice.currency)}
                      </div>
                      {l.url ? (
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Open payment link
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Coordinate payment with the lab using the reference{' '}
                          <span className="font-mono">{l.id.slice(-8)}</span>.
                        </span>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClinicDownloadPdfButton({ id }: { id: string }) {
  const get = useGetClinicInvoicePdf(id);
  return (
    <Button
      variant="outline"
      onClick={() =>
        get.mutate(undefined, {
          onSuccess: (res) => window.open(res.url, '_blank', 'noopener'),
        })
      }
      disabled={get.isPending}
    >
      {get.isPending ? 'Loading…' : 'Download PDF'}
    </Button>
  );
}
