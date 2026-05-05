'use client';

import { useState } from 'react';
import { Input } from '@org/ui';
import {
  InventoryAlertsCards,
  InventoryTable,
  NewItemDialog,
  useItems,
} from '@/features/inventory';

export default function InventoryPage() {
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useItems(q);

  return (
    <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.length} item${data.length === 1 ? '' : 's'}` : '…'} · FEFO dispense, lot tracking, expiry alerts
          </p>
        </div>
        <NewItemDialog />
      </header>

      <InventoryAlertsCards />

      <div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name or SKU…"
          className="max-w-sm"
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data && data.length === 0 && (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No items {q ? `matching "${q}"` : 'yet'}.
          </p>
        </div>
      )}
      {data && data.length > 0 && <InventoryTable items={data} />}
    </div>
  );
}
