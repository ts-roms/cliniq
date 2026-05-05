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
import { useTopServices } from '../hooks/use-reports';

export function TopServicesCard({ limit = 5 }: { limit?: number }) {
  const { data, isLoading, error } = useTopServices(limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top services · last 30 days</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Loading />}
        {error && <ErrorMessage error={error} />}
        {data && data.length === 0 && (
          <EmptyState
            title="No paid invoices yet"
            description="Once invoices start getting paid, your top services will surface here."
          />
        )}
        {data && data.length > 0 && (
          <ul className="divide-y">
            {data.map((row, idx) => (
              <li key={idx} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">{row.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.count} unit{row.count === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="font-mono text-sm">
                  {formatCentavos(row.revenueCentavos)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
