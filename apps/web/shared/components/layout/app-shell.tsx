'use client';

import { useState } from 'react';
import { type Session } from '@/features/auth/session';
import { ActingAsBanner } from '@/features/delegations';
import { AppHeader } from './app-header';
import { SideNav } from './side-nav';

export function AppShell({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <SideNav
        session={session}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader session={session} onOpenDrawer={() => setDrawerOpen(true)} />
        <ActingAsBanner />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
