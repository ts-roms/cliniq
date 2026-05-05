'use client';

import { ClaimsInbox, ProvidersSection } from '@/features/hmo';

export default function ClaimsAdminPage() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">HMO claims</h1>
        <p className="text-sm text-muted-foreground">
          Filed against patient invoices · paid claims auto-reconcile to invoice balances
        </p>
      </header>

      <ProvidersSection />

      <ClaimsInbox />
    </div>
  );
}
