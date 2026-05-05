'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import { useAiBudget } from '../hooks/use-ai-budget';

const PESO = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
});

function fmt(centavos: number): string {
  return PESO.format(centavos / 100);
}

export function AiBudgetCard() {
  const { data, isLoading, error } = useAiBudget();

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI budget</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error ? (error as Error).message : 'Loading…'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const ratio = data.budgetCentavos === 0 ? 0 : data.spentCentavos / data.budgetCentavos;
  const tone =
    data.hardStopped || ratio >= 1
      ? 'bg-destructive'
      : ratio >= 0.8
        ? 'bg-orange-500'
        : ratio >= 0.5
          ? 'bg-yellow-500'
          : 'bg-primary';

  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between">
        <CardTitle className="text-base">AI budget · {data.monthYear}</CardTitle>
        <span className="text-xs text-muted-foreground">
          {(ratio * 100).toFixed(0)}% used
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-2 w-full overflow-hidden rounded bg-muted">
          <div
            className={`h-full ${tone}`}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Spent <span className="font-mono">{fmt(data.spentCentavos)}</span>
          </span>
          <span>
            Cap <span className="font-mono">{fmt(data.budgetCentavos)}</span>
          </span>
        </div>
        {data.hardStopped && (
          <p className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
            AI generation paused — monthly cap reached. Upgrade plan or wait for next cycle.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
