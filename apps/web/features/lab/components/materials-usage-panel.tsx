'use client';

import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Input, Select } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  useCaseMaterialUsages,
  useDeleteCaseMaterialUsage,
  useMaterials,
  useRecordCaseMaterialUsage,
} from '../hooks/use-lab';

interface Props {
  caseId: string;
}

/**
 * Lab-side widget for recording material consumption on a case. Picks an
 * ACTIVE LOT from the lab's inventory and decrements it on submit. Showing
 * usages includes the LOT and material info for traceability.
 */
export function MaterialsUsagePanel({ caseId }: Props) {
  const { data: usages, isLoading } = useCaseMaterialUsages(caseId);
  const { data: materials } = useMaterials();
  const record = useRecordCaseMaterialUsage(caseId);
  const remove = useDeleteCaseMaterialUsage(caseId);

  // Flatten ACTIVE lots across all materials for the picker.
  const activeLots = useMemo(() => {
    const out: Array<{
      lotId: string;
      label: string;
      uom: string;
      remaining: number;
    }> = [];
    for (const m of materials ?? []) {
      for (const l of m.lots ?? []) {
        if (l.status !== 'ACTIVE') continue;
        out.push({
          lotId: l.id,
          label: `${m.name} · LOT (${m.unitOfMeasure})`,
          uom: m.unitOfMeasure,
          remaining: l.remainingQty,
        });
      }
    }
    return out;
  }, [materials]);

  const [lotId, setLotId] = useState('');
  const [qty, setQty] = useState('');
  const selectedLot = activeLots.find((l) => l.lotId === lotId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lotId || !qty) return;
    record.mutate(
      { lotId, qty: parseFloat(qty) },
      {
        onSuccess: () => {
          setLotId('');
          setQty('');
        },
      },
    );
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="space-y-3 rounded-md border border-border/60 p-3">
        <FormField label="LOT">
          <Select value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">— pick an active LOT —</option>
            {activeLots.map((l) => (
              <option key={l.lotId} value={l.lotId}>
                {l.label} ({l.remaining.toFixed(2)} {l.uom} left)
              </option>
            ))}
          </Select>
          {activeLots.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              No active LOTs. Receive one in <code>/lab/materials</code>.
            </p>
          )}
        </FormField>
        <FormField label={selectedLot ? `Qty used (${selectedLot.uom})` : 'Qty used'}>
          <Input
            type="number"
            step="0.01"
            min={0}
            max={selectedLot?.remaining}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="e.g. 35"
            disabled={!lotId}
          />
        </FormField>
        {record.error && (
          <p className="text-xs text-destructive">
            {(record.error as Error).message}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!lotId || !qty || record.isPending}>
            {record.isPending ? 'Recording…' : 'Record usage'}
          </Button>
        </div>
      </form>

      {isLoading && <p className="text-xs text-muted-foreground">Loading usages…</p>}
      {usages && usages.length === 0 && (
        <p className="text-xs text-muted-foreground">No materials recorded for this case.</p>
      )}

      <ul className="space-y-1.5">
        {usages?.map((u) => (
          <li
            key={u.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
          >
            <div>
              <div className="font-medium">{u.lot?.material.name ?? 'Material'}</div>
              <div className="text-[11px] text-muted-foreground">
                LOT <code className="font-mono">{u.lot?.lotNumber}</code> ·{' '}
                {u.qty} {u.lot?.material.unitOfMeasure} · {new Date(u.usedAt).toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove.mutate(u.id)}
              className="text-muted-foreground/60 hover:text-destructive"
              aria-label="Remove usage"
              disabled={remove.isPending}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
