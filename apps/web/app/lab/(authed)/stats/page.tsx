'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import { useLabStats } from '@/features/lab';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  IN_PROGRESS: 'In progress',
  AWAITING_PICKUP: 'Awaiting pickup',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-zinc-300 dark:bg-zinc-700',
  SUBMITTED: 'bg-blue-400 dark:bg-blue-700',
  IN_PROGRESS: 'bg-indigo-500 dark:bg-indigo-700',
  AWAITING_PICKUP: 'bg-amber-400 dark:bg-amber-700',
  SHIPPED: 'bg-cyan-400 dark:bg-cyan-700',
  DELIVERED: 'bg-emerald-500 dark:bg-emerald-700',
  CANCELLED: 'bg-zinc-400 dark:bg-zinc-600',
  REJECTED: 'bg-red-500 dark:bg-red-700',
};

function formatPhp(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function LabStatsPage() {
  const { data, isLoading, error } = useLabStats();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  const totalRevenue = data.revenueByMonth.reduce((s, m) => s + m.cents, 0);
  const maxMonthCases = Math.max(1, ...data.casesByMonth.map((m) => m.count));
  const maxMonthRevenue = Math.max(1, ...data.revenueByMonth.map((m) => m.cents));
  const maxStatusCount = Math.max(1, ...Object.values(data.casesByStatus));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Stats</h1>
        <p className="text-sm text-muted-foreground">
          Trailing 12 months. Click through to{' '}
          <span className="font-medium">/lab/cases</span> and{' '}
          <span className="font-medium">/lab/billing</span> for drill-downs.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard title="Open caseload" value={String(data.openCases)} hint="not yet delivered" />
        <SummaryCard title="Outstanding" value={formatPhp(data.outstandingCents)} hint="issued + overdue, unpaid" />
        <SummaryCard title="12-mo paid revenue" value={formatPhp(totalRevenue)} hint="sum of paidCents" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cases by status (lifetime)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(data.casesByStatus).length === 0 && (
              <p className="text-sm text-muted-foreground">No cases yet.</p>
            )}
            {Object.entries(data.casesByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3 text-sm">
                <span className="w-32 text-muted-foreground">
                  {STATUS_LABELS[status] ?? status}
                </span>
                <div className="flex-1 overflow-hidden rounded-full bg-muted/40">
                  <div
                    className={`h-2 ${STATUS_COLOR[status] ?? 'bg-primary'}`}
                    style={{ width: `${(count / maxStatusCount) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right tabular-nums">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cases delivered per month</CardTitle>
          </CardHeader>
          <CardContent>
            {data.casesByMonth.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No deliveries in the last 12 months.
              </p>
            ) : (
              <div className="flex h-32 items-end gap-1">
                {data.casesByMonth.map((m) => (
                  <div
                    key={m.month}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={`${m.month}: ${m.count}`}
                  >
                    <div
                      className="w-full rounded-t bg-emerald-500/80 dark:bg-emerald-700"
                      style={{ height: `${(m.count / maxMonthCases) * 100}%` }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {m.month.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paid revenue per month</CardTitle>
        </CardHeader>
        <CardContent>
          {data.revenueByMonth.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid invoices yet.</p>
          ) : (
            <div className="flex h-32 items-end gap-1">
              {data.revenueByMonth.map((m) => (
                <div
                  key={m.month}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${m.month}: ${formatPhp(m.cents)}`}
                >
                  <div
                    className="w-full rounded-t bg-blue-500/80 dark:bg-blue-700"
                    style={{ height: `${(m.cents / maxMonthRevenue) * 100}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {m.month.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top clinics</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topClinics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clinic activity yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Clinic</th>
                  <th className="py-2 pr-3 text-right">Cases</th>
                  <th className="py-2 pr-3 text-right">Paid revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.topClinics.map((c) => (
                  <tr key={c.clinicId} className="border-b last:border-0">
                    <td className="py-2 pr-3">{c.name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.cases}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatPhp(c.revenueCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}
