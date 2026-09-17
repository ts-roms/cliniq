'use client';

import { useEffect, useState } from 'react';
import { Truck, CheckCircle2 } from 'lucide-react';
import { Button, Input } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  useLabCaseShipment,
  useMarkLabCaseDelivered,
  useUpsertLabCaseShipment,
} from '../hooks/use-lab';

interface Props {
  caseId: string;
  side: 'lab' | 'clinic';
  /** Hide the editing form on the clinic side. */
  caseStatus: string;
}

export function ShipmentWidget({ caseId, side, caseStatus }: Props) {
  const { data, isLoading } = useLabCaseShipment(caseId, side);
  const upsert = useUpsertLabCaseShipment(caseId);
  const markDelivered = useMarkLabCaseDelivered(caseId, side);

  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!data) return;
    setCarrier(data.carrier ?? '');
    setTracking(data.trackingNumber ?? '');
    setNotes(data.notes ?? '');
  }, [data?.id]);

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading shipment…</p>;

  const isLabSide = side === 'lab';
  const canEdit =
    isLabSide && (caseStatus === 'IN_PROGRESS' || caseStatus === 'AWAITING_PICKUP' || caseStatus === 'SHIPPED');
  const showMarkDelivered =
    !!data && data.deliveredAt === null && (caseStatus === 'SHIPPED' || caseStatus === 'AWAITING_PICKUP');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate({
      carrier: carrier || null,
      trackingNumber: tracking || null,
      notes: notes || null,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
        <Truck className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <div className="flex-1 text-sm">
          {data ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {data.carrier ?? 'Carrier TBD'}
                </span>
                {data.trackingNumber && (
                  <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">
                    {data.trackingNumber}
                  </code>
                )}
                {data.deliveredAt ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" aria-hidden /> Delivered
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    In transit
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Shipped {new Date(data.shippedAt).toLocaleString()}
                {data.deliveredAt &&
                  ` · Delivered ${new Date(data.deliveredAt).toLocaleString()}`}
              </div>
              {data.notes && (
                <p className="mt-1 text-xs text-muted-foreground">{data.notes}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No shipment yet.</p>
          )}
        </div>
      </div>

      {canEdit && (
        <form onSubmit={submit} className="space-y-2 rounded-md border border-border/60 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <FormField label="Carrier">
              <Input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="LBC, J&T, in-house…"
                maxLength={80}
              />
            </FormField>
            <FormField label="Tracking #">
              <Input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="AB1234567PH"
                maxLength={120}
              />
            </FormField>
          </div>
          <FormField label="Notes (optional)">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. handed off to courier 14:30, fragile"
              maxLength={500}
            />
          </FormField>
          {upsert.error && (
            <p className="text-xs text-destructive">
              {(upsert.error as Error).message}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : data ? 'Update' : 'Create shipment'}
            </Button>
          </div>
        </form>
      )}

      {showMarkDelivered && (
        <Button
          size="sm"
          variant="outline"
          disabled={markDelivered.isPending}
          onClick={() => markDelivered.mutate()}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
          {markDelivered.isPending ? 'Marking…' : 'Mark delivered'}
        </Button>
      )}
      {markDelivered.error && (
        <p className="text-xs text-destructive">
          {(markDelivered.error as Error).message}
        </p>
      )}
    </div>
  );
}
