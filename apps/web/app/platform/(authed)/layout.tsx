'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PlatformNav, usePlatformSession } from '@/features/platform';

export default function PlatformAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = usePlatformSession();
  const router = useRouter();

  useEffect(() => {
    if (session === null) router.replace('/platform/login');
  }, [session, router]);

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
