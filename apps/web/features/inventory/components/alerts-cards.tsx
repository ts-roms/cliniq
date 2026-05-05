'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import { useExpiring, useLowStock } from '../hooks/use-inventory';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function InventoryAlertsCards() {
  const lowStock = useLowStock();
  const expiring = useExpiring();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Low stock</CardTitle>
        </CardHeader>
        <CardContent>
          {lowStock.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {lowStock.data && lowStock.data.length === 0 && (
            <p className="text-sm text-muted-foreground">All items are above reorder level.</p>
          )}
          {lowStock.data && lowStock.data.length > 0 && (
            <ul className="space-y-1 text-sm">
              {lowStock.data.map((row) => (
                <li key={row.id} className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{row.name}</span>{' '}
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.sku}
                    </span>
                  </div>
                  <span className="font-mono text-rose-700">
                    {row.onHand} / {row.reorderLevel} {row.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expiring within 60 days</CardTitle>
        </CardHeader>
        <CardContent>
          {expiring.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {expiring.data && expiring.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No batches expiring soon.</p>
          )}
          {expiring.data && expiring.data.length > 0 && (
            <ul className="space-y-1 text-sm">
              {expiring.data.map((b) => {
                const days = daysUntil(b.expiresOn);
                const tone =
                  days !== null && days <= 14
                    ? 'text-rose-700'
                    : days !== null && days <= 30
                      ? 'text-amber-700'
                      : 'text-foreground';
                return (
                  <li key={b.id} className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{b.item.name}</span>{' '}
                      <span className="text-xs text-muted-foreground">
                        ({b.lotNumber ?? 'no lot'})
                      </span>
                    </div>
                    <span className={`font-mono ${tone}`}>
                      {b.remainingQty} {b.item.unit} · {formatDate(b.expiresOn)}
                      {days !== null && ` (${days}d)`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
