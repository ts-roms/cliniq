'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import type { LabAbnormalFlag } from '../schemas/labs';
import { useLabOrdersForConsultation } from '../hooks/use-labs';
import { NewLabOrderDialog } from './new-order-dialog';

const FLAG_TONE: Record<LabAbnormalFlag, string> = {
  NORMAL: 'text-emerald-700',
  HIGH: 'text-amber-700',
  LOW: 'text-amber-700',
  CRITICAL_HIGH: 'text-rose-700 font-bold',
  CRITICAL_LOW: 'text-rose-700 font-bold',
  ABNORMAL: 'text-rose-700',
};

export function ConsultLabsPanel({
  patientId,
  consultationId,
}: {
  patientId: string;
  consultationId: string;
}) {
  const { data, isLoading } = useLabOrdersForConsultation(consultationId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Labs</CardTitle>
        <NewLabOrderDialog patientId={patientId} consultationId={consultationId} />
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">No labs ordered for this consult.</p>
        )}
        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((order) => (
              <li key={order.id} className="rounded border bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{order.number}</span>
                  <span className="text-xs text-muted-foreground">{order.status}</span>
                </div>
                <ul className="mt-1 text-xs">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between">
                      <span>{item.testName}</span>
                      <span
                        className={`font-mono ${
                          item.abnormalFlag ? FLAG_TONE[item.abnormalFlag] : 'text-muted-foreground'
                        }`}
                      >
                        {item.resultValue
                          ? `${item.resultValue}${item.resultUnit ? ` ${item.resultUnit}` : ''}`
                          : 'pending'}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
