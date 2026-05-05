'use client';

import { useRequiredSession } from '@/features/auth';
import { AppShell } from '@/shared/components/layout/app-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useRequiredSession();
  if (!session) return null; // hook redirects to /login

  return <AppShell session={session}>{children}</AppShell>;
}
