'use client';

import { DsrInbox } from '@/features/dsr';

export default function DsrInboxPage() {
  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Data subject requests
        </h1>
        <p className="text-sm text-muted-foreground">
          DPO inbox · Data Privacy Act §16
        </p>
      </header>
      <DsrInbox />
    </div>
  );
}
