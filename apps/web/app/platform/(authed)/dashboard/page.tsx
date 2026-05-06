import { TenantsTable } from '@/features/platform';

export default function PlatformDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tenants</h1>
          <p className="text-sm text-muted-foreground">
            Manage subscriptions, plans, and trial windows.
          </p>
        </div>
      </div>

      <TenantsTable />
    </div>
  );
}
