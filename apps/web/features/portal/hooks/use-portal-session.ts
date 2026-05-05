'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/features/auth';
import type { Session } from '@/features/auth/session';

/**
 * Returns the session if the caller is a PATIENT-role portal user. Otherwise:
 *   - no session → /portal/login
 *   - staff session → /patients (kicks them out of the portal area)
 */
export function useRequiredPortalSession(): Session | null {
  const session = useSession();
  const router = useRouter();

  const isPortalUser = session && session.user.role === 'PATIENT' && session.user.patientId;

  useEffect(() => {
    if (!session) {
      router.replace('/portal/login');
      return;
    }
    if (!isPortalUser) {
      router.replace('/patients');
    }
  }, [session, isPortalUser, router]);

  return isPortalUser ? session : null;
}
