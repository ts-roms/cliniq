'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import { useMeRecords } from '../hooks/use-me';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PortalRecordsView() {
  const { data, isLoading, error } = useMeRecords();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Allergies</CardTitle>
        </CardHeader>
        <CardContent>
          {data.allergies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No known allergies.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.allergies.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.substance}</span>{' '}
                  <span className="text-xs text-muted-foreground">({a.severity})</span>
                  {a.reaction && (
                    <p className="text-xs text-muted-foreground">→ {a.reaction}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Medications</CardTitle>
        </CardHeader>
        <CardContent>
          {data.medications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active medications.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.medications.map((m) => (
                <li key={m.id}>
                  <span className="font-medium">{m.drugName}</span>{' '}
                  <span className="text-xs text-muted-foreground">({m.status})</span>
                  <p className="text-xs text-muted-foreground">
                    {[m.dose, m.frequency].filter(Boolean).join(' · ') || '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conditions</CardTitle>
        </CardHeader>
        <CardContent>
          {data.conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conditions on file.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.conditions.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{c.name}</span>{' '}
                  {c.icd10Code && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.icd10Code}
                    </span>
                  )}{' '}
                  <span className="text-xs text-muted-foreground">({c.status})</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent vitals</CardTitle>
        </CardHeader>
        <CardContent>
          {data.vitals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vitals recorded.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {data.vitals.map((v) => (
                <li key={v.id} className="flex justify-between font-mono">
                  <span>{formatDateTime(v.recordedAt)}</span>
                  <span>
                    BP {v.systolic ?? '—'}/{v.diastolic ?? '—'} · HR {v.heartRate ?? '—'} ·
                    SpO₂ {v.spo2 ?? '—'} · BMI {v.bmi ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Prescriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {data.prescriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No prescriptions on file.</p>
          ) : (
            <ul className="space-y-3">
              {data.prescriptions.map((rx) => (
                <li key={rx.id} className="rounded border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{rx.number}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(rx.issuedAt).toLocaleDateString()} · {rx.status}
                    </span>
                  </div>
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {rx.items.map((it, i) => (
                      <li key={i}>
                        {it.drugName}
                        {it.dose && ` ${it.dose}`}
                        {it.frequency && ` · ${it.frequency}`}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Lab results</CardTitle>
        </CardHeader>
        <CardContent>
          {data.labOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lab results yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.labOrders.map((order) => (
                <li key={order.id} className="rounded border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{order.number}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()} · {order.status}
                    </span>
                  </div>
                  <ul className="mt-1 text-xs">
                    {order.items.map((it) => (
                      <li key={it.id} className="flex justify-between">
                        <span>{it.testName}</span>
                        <span
                          className={`font-mono ${
                            it.abnormalFlag === 'CRITICAL_HIGH' ||
                            it.abnormalFlag === 'CRITICAL_LOW'
                              ? 'text-rose-700 font-bold'
                              : it.abnormalFlag === 'HIGH' || it.abnormalFlag === 'LOW'
                                ? 'text-amber-700'
                                : it.abnormalFlag === 'ABNORMAL'
                                  ? 'text-rose-700'
                                  : ''
                          }`}
                        >
                          {it.resultValue
                            ? `${it.resultValue}${it.resultUnit ? ` ${it.resultUnit}` : ''}`
                            : 'pending'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[10px] italic text-muted-foreground">
                    Discuss results with your provider — values shown are for reference only.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
