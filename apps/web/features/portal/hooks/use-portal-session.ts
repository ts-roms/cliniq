'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/features/auth';
import type { Session } from '@/features/auth/session';

/**
 * Returns the session if the caller is a PATIENT-role portal user. Otherwise:
 *   - no session → /portal/login
 *   - staff session → /patients (kicks them out of the portal area)
 *
 * Same hydration gate as `useRequiredSession`: the server snapshot is null,
 * so we must wait one effect tick for the localStorage-backed store to
 * resync before deciding to redirect.
 */
export function useRequiredPortalSession(): Session | null {
  const session = useSession();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  const isPortalUser = session && session.user.role === 'PATIENT' && session.user.patientId;

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      router.replace('/portal/login');
      return;
    }
    if (!isPortalUser) {
      router.replace('/patients');
    }
  }, [hydrated, session, isPortalUser, router]);

  return isPortalUser ? session : null;
}
