'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './use-session';
import type { Session } from '../session';

/**
 * Returns the session if signed in, otherwise navigates to /login.
 *
 * The `hydrated` gate is load-bearing: `useSession` is backed by
 * `useSyncExternalStore` with a server snapshot of `null` (required to avoid
 * hydration mismatches, since localStorage isn't readable on the server). On
 * the first client render, `session` is therefore `null` even when
 * localStorage has a valid session. Without the gate, every page refresh
 * would bounce the user to /login before the store's post-hydration sync
 * could re-read localStorage and surface the real value.
 */
export function useRequiredSession(): Session | null {
  const session = useSession();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && !session) router.replace('/login');
  }, [hydrated, session, router]);

  return session;
}
