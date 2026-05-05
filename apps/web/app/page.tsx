'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/features/auth';

export default function Index() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    router.replace(session ? '/patients' : '/login');
  }, [session, router]);

  return (
    <main className="container mx-auto flex min-h-screen items-center justify-center px-4 sm:px-6">
      <p className="text-sm text-muted-foreground">Redirecting…</p>
    </main>
  );
}
