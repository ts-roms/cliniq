'use client';

import { useSession } from '@/features/auth';

/**
 * Returns the active tenant's kind (CLINIC | LAB) from the session JWT,
 * or null when not signed in. Drives /lab vs clinic UI shells.
 */
export function useTenantKind(): 'CLINIC' | 'LAB' | null {
  const session = useSession();
  return session?.user.tenantKind ?? null;
}
