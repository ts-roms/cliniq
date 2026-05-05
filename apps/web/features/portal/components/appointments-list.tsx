'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import { useMeAppointments } from '../hooks/use-me';

const STATUS_TONE: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800',
  CHECKED_IN: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-zinc-200 text-zinc-700',
  NO_SHOW: 'bg-rose-100 text-rose-800',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PortalAppointmentsList() {
  const { data, isLoading, error } = useMeAppointments();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your appointments</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        )}
        {data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">No appointments yet.</p>
        )}
        {data && data.length > 0 && (
          <ul className="divide-y">
            {data.map((appt) => (
              <li key={appt.id} className="py-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{formatDateTime(appt.startsAt)}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[appt.status] ?? ''}`}
                  >
                    {appt.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {appt.type} · {appt.reason ?? 'no reason on file'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
