'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import { formatCentavos } from '@/features/billing';
import { useMeInvoices } from '../hooks/use-me';
import { usePortalInvoicePdf } from '../hooks/use-portal-invoice-pdf';

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-zinc-200 text-zinc-700',
  SENT: 'bg-blue-100 text-blue-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  OVERDUE: 'bg-rose-100 text-rose-800',
  CANCELLED: 'bg-zinc-300 text-zinc-700 line-through',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function PortalInvoicesList() {
  const { data, isLoading, error } = useMeInvoices();
  const pdf = usePortalInvoicePdf();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your invoices</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        )}
        {data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">No invoices on file.</p>
        )}
        {data && data.length > 0 && (
          <ul className="space-y-3">
            {data.map((inv) => {
              const remaining = Math.max(inv.totalCentavos - inv.paidCentavos, 0);
              return (
                <li key={inv.id} className="rounded border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{inv.number}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[inv.status] ?? ''}`}
                    >
                      {inv.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Issued {formatDate(inv.issuedAt)}
                  </p>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {inv.items.map((it, i) => (
                      <li key={i} className="flex justify-between">
                        <span>
                          {it.description}
                          {it.quantity > 1 && ` × ${it.quantity}`}
                        </span>
                        <span className="font-mono">{formatCentavos(it.totalCentavos)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex justify-between border-t pt-2 text-sm">
                    <span className="text-muted-foreground">
                      Total {formatCentavos(inv.totalCentavos)} · Paid{' '}
                      {formatCentavos(inv.paidCentavos)}
                    </span>
                    <span className="font-semibold">{formatCentavos(remaining)} due</span>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pdf.mutate(inv.id)}
                      disabled={pdf.isPending}
                    >
                      {pdf.isPending ? 'Opening…' : 'Download PDF'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
