'use client';

import {
  NoShowCard,
  OverviewGrid,
  RevenueChart,
  TopServicesCard,
} from '@/features/reports';

export default function DashboardPage() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Clinic-wide KPIs · refreshed on load
        </p>
      </header>

      <OverviewGrid />

      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart />
        <TopServicesCard />
      </div>

      <NoShowCard />
    </div>
  );
}
