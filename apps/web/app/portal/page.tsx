import { PortalOverviewCards } from '@/features/portal';

export default function PortalHomePage() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-extralight tracking-tight">Your portal</h1>
        <p className="text-sm text-muted-foreground">
          See appointments, records, and invoices from your clinic.
        </p>
      </header>
      <PortalOverviewCards />
    </div>
  );
}
