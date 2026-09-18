'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlatformNav, usePlatformSession } from '@/features/platform';

export default function PlatformAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = usePlatformSession();
  const router = useRouter();

  // usePlatformSession is a useSyncExternalStore whose *server* snapshot is
  // null, so the very first client render always sees null before the store
  // is read from localStorage. Redirecting on that render sent signed-in
  // admins to /platform/login a beat after the page had already mounted
  // (the tenants table rendered, fetched, then got torn down). Same guard
  // as useRequiredSession on the clinic side: only trust null once hydrated.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated && session === null) router.replace('/platform/login');
  }, [hydrated, session, router]);

  if (!session) {
    // Avoid a flash of authed UI before the redirect lands.
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <PlatformNav />
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
