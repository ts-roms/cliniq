'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorMessage,
  Loading,
} from '@org/ui';
import { useNoShowRates } from '../hooks/use-reports';

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function NoShowCard() {
  const { data, isLoading, error } = useNoShowRates();

  return (
    <Card>
      <CardHeader>
        <CardTitle>No-show rate by provider · last 30 days</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Loading />}
        {error && <ErrorMessage error={error} />}
        {data && data.length === 0 && (
          <EmptyState title="No appointments in window" />
        )}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Provider</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Completed</th>
                <th className="py-2 text-right">Cancelled</th>
                <th className="py-2 text-right">No-show</th>
                <th className="py-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.providerId} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">
                    {row.providerId.slice(0, 12)}…
                  </td>
                  <td className="py-2 text-right">{row.total}</td>
                  <td className="py-2 text-right text-emerald-700">{row.completed}</td>
                  <td className="py-2 text-right text-zinc-500">{row.cancelled}</td>
                  <td className="py-2 text-right text-rose-700">{row.noShow}</td>
                  <td
                    className={`py-2 text-right font-medium ${
                      row.noShowRate >= 0.15 ? 'text-rose-700' : 'text-foreground'
                    }`}
                  >
                    {formatPct(row.noShowRate)}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
