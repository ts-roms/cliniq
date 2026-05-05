'use client';

import { usePathname } from 'next/navigation';
import { useSession } from '@/features/auth';
import { PortalHeader, useRequiredPortalSession } from '@/features/portal';

const PUBLIC_PATHS = new Set(['/portal/login', '/portal/signup']);

function isPublic(path: string | null): boolean {
  if (!path) return false;
  if (PUBLIC_PATHS.has(path)) return true;
  // Telemedicine join: /portal/tele/<token>. Patients use it without a portal
  // account — auth is the joinToken in the path.
  if (path.startsWith('/portal/tele/')) return true;
  return false;
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (isPublic(path)) {
    return <PublicShell>{children}</PublicShell>;
  }
  return <PrivateShell>{children}</PrivateShell>;
}

function PublicShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  return (
    <div className="flex min-h-screen flex-col">
      {session && session.user.role === 'PATIENT' && session.user.patientId && (
        <PortalHeader session={session} />
      )}
      <main className="flex-1">{children}</main>
    </div>
  );
}

function PrivateShell({ children }: { children: React.ReactNode }) {
  const session = useRequiredPortalSession();
  if (!session) return null;
  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader session={session} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
