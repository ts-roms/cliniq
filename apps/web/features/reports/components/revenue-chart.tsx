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
import { formatCentavos } from '@/features/billing';
import { useRevenueSeries } from '../hooks/use-reports';

export function RevenueChart() {
  const { data, isLoading, error } = useRevenueSeries();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily revenue · last 30 days</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Loading />}
        {error && <ErrorMessage error={error} />}
        {data && data.points.length === 0 && (
          <EmptyState
            title="No revenue yet"
            description="Mark an invoice as paid and it will appear here."
          />
        )}
        {data && data.points.length > 0 && <Bars points={data.points} />}
      </CardContent>
    </Card>
  );
}

function Bars({ points }: { points: { date: string; amountCentavos: number }[] }) {
  const max = Math.max(...points.map((p) => p.amountCentavos), 1);
  const total = points.reduce((sum, p) => sum + p.amountCentavos, 0);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-2xl font-semibold">{formatCentavos(total)}</p>
        <p className="text-xs text-muted-foreground">total over period</p>
      </div>
      <div className="flex h-32 items-end gap-1">
        {points.map((p) => {
          const heightPct = (p.amountCentavos / max) * 100;
          return (
            <div
              key={p.date}
              className="group relative flex-1"
              title={`${p.date}: ${formatCentavos(p.amountCentavos)}`}
            >
              <div
                className="rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                style={{ height: `${Math.max(heightPct, 2)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}
