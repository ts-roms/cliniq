'use client';

import { memo } from 'react';
import { formatCentavos } from '@/features/billing';
import type { InventoryItemRow } from '../schemas/inventory';
import { DispenseDialog } from './dispense-dialog';
import { ReceiveBatchDialog } from './receive-batch-dialog';

export const InventoryTable = memo(function InventoryTable({
  items,
}: {
  items: InventoryItemRow[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[820px]">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2">SKU</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2 text-right">On hand</th>
            <th className="px-4 py-2 text-right">Reorder ≤</th>
            <th className="px-4 py-2 text-right">Default price</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0 align-top">
              <td className="px-4 py-3 font-mono text-xs">{item.sku}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.name}</span>
                  {item.isControlled && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800">
                      controlled
                    </span>
                  )}
                  {!item.active && (
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">
                      inactive
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {item.category ?? '—'}
              </td>
              <td
                className={`px-4 py-3 text-right font-mono ${
                  item.belowReorder ? 'text-rose-700 font-semibold' : ''
                }`}
              >
                {item.onHand} {item.unit}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                {item.reorderLevel}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs">
                {formatCentavos(item.defaultPriceCentavos)}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <DispenseDialog itemId={item.id} onHand={item.onHand} />
                  <ReceiveBatchDialog itemId={item.id} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
