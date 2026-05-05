'use client';

import { BroadcastForm } from '@/features/notifications';
import { SettingsForm, useTenantSettings } from '@/features/settings';
import { DelegationsCard } from '@/features/delegations';

export default function ClinicSettingsPage() {
  const { data, isLoading, error } = useTenantSettings();

  return (
    <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Clinic settings</h1>
        <p className="text-sm text-muted-foreground">
          Branding, operating hours, accepted payment methods, VAT
        </p>
      </header>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data && <SettingsForm tenant={data} />}

      <section className="space-y-2 pt-4">
        <h2 className="text-lg font-semibold tracking-tight">Delegations</h2>
        <DelegationsCard />
      </section>

      <section className="space-y-2 pt-4">
        <h2 className="text-lg font-semibold tracking-tight">Team announcements</h2>
        <BroadcastForm />
      </section>
    </div>
  );
}
