'use client';

import { Card, ErrorMessage, Skeleton } from '@org/ui';
import { formatCentavos } from '@/features/billing';
import { useOverview } from '../hooks/use-reports';
import { KpiTile } from './kpi-tile';

function formatDelta(pct: number | null): React.ReactNode {
  if (pct === null) return 'no prior data';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}% vs last month`;
}

function budgetTone(spent: number, budget: number | null) {
  if (!budget) return 'default';
  const pct = spent / budget;
  if (pct >= 1) return 'critical';
  if (pct >= 0.8) return 'warning';
  return 'positive';
}

export function OverviewGrid() {
  const { data, isLoading, error } = useOverview();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-32" />
          </Card>
        ))}
      </div>
    );
  }
  if (error) {
    return <ErrorMessage error={error} />;
  }
  if (!data) return null;

  const aiPct = data.ai.budgetCentavos
    ? Math.round((data.ai.spentCentavos / data.ai.budgetCentavos) * 100)
    : null;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <KpiTile
        label="Patients added"
        value={data.patients.addedThisMonth}
        hint={formatDelta(data.patients.deltaPct)}
        tone={
          data.patients.deltaPct !== null && data.patients.deltaPct < 0
            ? 'warning'
            : 'positive'
        }
      />
      <KpiTile
        label="Active consults"
        value={data.consults.activeNow}
        hint={`${data.consults.startedThisMonth} started this month`}
      />
      <KpiTile
        label="Revenue collected"
        value={formatCentavos(data.revenue.collectedCentavos)}
        hint="this month"
        tone="positive"
      />
      <KpiTile
        label="Outstanding A/R"
        value={formatCentavos(data.revenue.outstandingCentavos)}
        hint="across unpaid invoices"
        tone={data.revenue.outstandingCentavos > 0 ? 'warning' : 'default'}
      />
      <KpiTile
        label="Prescriptions written"
        value={data.prescriptions.writtenThisMonth}
        hint="this month"
      />
      <KpiTile
        label="AI budget"
        value={
          data.ai.budgetCentavos
            ? `${formatCentavos(data.ai.spentCentavos)} / ${formatCentavos(data.ai.budgetCentavos)}`
            : formatCentavos(data.ai.spentCentavos)
        }
        hint={
          data.ai.hardStopped
            ? 'HARD STOPPED — increase plan'
            : aiPct !== null
              ? `${aiPct}% used`
              : 'no monthly cap set'
        }
        tone={
          data.ai.hardStopped ? 'critical' : budgetTone(data.ai.spentCentavos, data.ai.budgetCentavos)
        }
      />
      <KpiTile
        label="Open DSR"
        value={data.compliance.openDsr}
        hint="data subject requests pending"
        tone={data.compliance.openDsr > 0 ? 'warning' : 'positive'}
      />
      <KpiTile
        label="AI suggestions"
        value={data.ai.suggestions.reduce((sum, s) => sum + s.count, 0)}
        hint="this month (all kinds)"
      />
    </div>
  );
}
