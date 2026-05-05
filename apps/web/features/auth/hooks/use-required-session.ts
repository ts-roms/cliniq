'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './use-session';
import type { Session } from '../session';

/**
 * Returns the session if signed in, otherwise navigates to /login.
 * The single useEffect here is unavoidable — `router.replace()` is a side
 * effect on the App Router. We keep it tight and isolated to this hook so
 * pages don't have to repeat the pattern.
 */
export function useRequiredSession(): Session | null {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session) router.replace('/login');
  }, [session, router]);

  return session;
}
