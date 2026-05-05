'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import { formatCentavos } from '@/features/billing';
import {
  useMeAppointments,
  useMeInvoices,
  useMeProfile,
} from '../hooks/use-me';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PortalOverviewCards() {
  const profile = useMeProfile();
  const appts = useMeAppointments();
  const invoices = useMeInvoices();

  const upcoming = appts.data
    ?.filter((a) => new Date(a.startsAt) >= new Date())
    .slice(-3)
    .reverse();

  const outstandingCentavos =
    invoices.data?.reduce(
      (sum, inv) =>
        inv.status === 'PAID' || inv.status === 'CANCELLED'
          ? sum
          : sum + Math.max(inv.totalCentavos - inv.paidCentavos, 0),
      0,
    ) ?? 0;

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.data ? (
            <>
              <p className="text-lg font-medium">
                {profile.data.firstName} {profile.data.lastName}
              </p>
              <p className="text-xs text-muted-foreground">
                MRN <span className="font-mono">{profile.data.mrn}</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent>
          {!upcoming || upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {upcoming.map((a) => (
                <li key={a.id}>
                  <p className="font-medium">{formatDateTime(a.startsAt)}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.type} · {a.reason ?? 'no reason'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{formatCentavos(outstandingCentavos)}</p>
          <p className="text-xs text-muted-foreground">across unpaid invoices</p>
        </CardContent>
      </Card>
    </div>
  );
}
