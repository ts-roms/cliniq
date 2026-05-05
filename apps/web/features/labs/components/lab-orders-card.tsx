'use client';

import {
  Card, CardContent, CardHeader, CardTitle,
  Loading,
  ErrorMessage,
  EmptyState,
} from '@org/ui';
import type { LabAbnormalFlag, LabOrder, LabOrderStatus } from '../schemas/labs';
import { useLabOrdersForPatient, useUpdateOrderStatus } from '../hooks/use-labs';
import { NewLabOrderDialog } from './new-order-dialog';
import { RecordResultsDialog } from './record-results-dialog';

const STATUS_TONE: Record<LabOrderStatus, string> = {
  PENDING: 'bg-zinc-200 text-zinc-700',
  COLLECTED: 'bg-blue-100 text-blue-800',
  RECEIVED: 'bg-amber-100 text-amber-800',
  REPORTED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-zinc-300 text-zinc-700 line-through',
};

const FLAG_TONE: Record<LabAbnormalFlag, string> = {
  NORMAL: 'text-emerald-700',
  HIGH: 'text-amber-700',
  LOW: 'text-amber-700',
  CRITICAL_HIGH: 'text-rose-700 font-bold',
  CRITICAL_LOW: 'text-rose-700 font-bold',
  ABNORMAL: 'text-rose-700',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export function LabOrdersCard({ patientId }: { patientId: string }) {
  const { data, isLoading, error } = useLabOrdersForPatient(patientId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Lab orders</CardTitle>
        <NewLabOrderDialog patientId={patientId} />
      </CardHeader>
      <CardContent>
        {isLoading && <Loading />}
        {error && <ErrorMessage error={error} />}
        {data && data.length === 0 && (
          <EmptyState
            title="No lab orders"
            description="Order labs from the consultation page."
          />
        )}
        {data && data.length > 0 && (
          <ul className="space-y-3">
            {data.map((order) => (
              <LabOrderItem key={order.id} order={order} patientId={patientId} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LabOrderItem({ order, patientId }: { order: LabOrder; patientId: string }) {
  const update = useUpdateOrderStatus({ patientId, consultationId: order.consultationId ?? undefined });
  const abnormalCount = order.items.filter(
    (i) => i.abnormalFlag && i.abnormalFlag !== 'NORMAL',
  ).length;

  return (
    <li className="rounded border bg-card p-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-sm">{order.number}</span>
          {order.vendor && (
            <span className="ml-2 text-xs text-muted-foreground">@ {order.vendor}</span>
          )}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[order.status]}`}>
          {order.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Ordered {formatDate(order.createdAt)}
        {order.collectedAt && ` · collected ${formatDate(order.collectedAt)}`}
        {order.reportedAt && ` · reported ${formatDate(order.reportedAt)}`}
      </p>

      <ul className="mt-2 divide-y text-sm">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between py-1">
            <span>
              {item.testName}
              {item.referenceLow !== null && item.referenceHigh !== null && (
                <span className="ml-1 text-xs text-muted-foreground">
                  (ref {item.referenceLow}–{item.referenceHigh}
                  {item.resultUnit && ` ${item.resultUnit}`})
                </span>
              )}
            </span>
            {item.resultValue ? (
              <span
                className={`font-mono ${
                  item.abnormalFlag ? FLAG_TONE[item.abnormalFlag] : ''
                }`}
              >
                {item.resultValue}
                {item.resultUnit && ` ${item.resultUnit}`}
                {item.abnormalFlag && item.abnormalFlag !== 'NORMAL' && ` · ${item.abnormalFlag}`}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">pending</span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center justify-end gap-2">
        {abnormalCount > 0 && (
          <span className="text-xs text-rose-700">
            {abnormalCount} abnormal
          </span>
        )}
        {order.status === 'PENDING' && (
          <button
            onClick={() => update.mutate({ id: order.id, status: 'COLLECTED' })}
            className="text-xs text-primary hover:underline"
            disabled={update.isPending}
          >
            mark collected
          </button>
        )}
        {order.status === 'COLLECTED' && (
          <button
            onClick={() => update.mutate({ id: order.id, status: 'RECEIVED' })}
            className="text-xs text-primary hover:underline"
            disabled={update.isPending}
          >
            mark received
          </button>
        )}
        <RecordResultsDialog order={order} patientId={patientId} />
      </div>
    </li>
  );
}
