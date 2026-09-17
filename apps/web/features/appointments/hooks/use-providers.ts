'use client';

import { useQuery } from '@tanstack/react-query';
import { delegationsControllerListEligibleDelegatees } from '@org/api-client';
import { useSession } from '@/features/auth';

/**
 * Tenant members who can be picked as an appointment provider. Reuses the
 * delegations "eligible delegatees" endpoint (returns all non-PATIENT members
 * except the caller), then injects the current user so they can pick
 * themselves.
 *
 * If a dedicated `/tenant/members` endpoint ships later, swap this for it —
 * the public shape (Provider[]) stays the same.
 */

export interface Provider {
  id: string;
  name: string;
  email?: string | null;
  role: string;
}

const PROVIDER_ROLES = new Set([
  'OWNER',
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
]);

export function useProviders() {
  const session = useSession();
  return useQuery({
    queryKey: ['appointment-providers'],
    queryFn: async (): Promise<Provider[]> => {
      const { data, error } = await delegationsControllerListEligibleDelegatees();
      if (error || !data) throw new Error('Failed to load providers');
      // The api returns active non-PATIENT members minus the caller. Add the
      // current user so they can schedule themselves. Filter to clinical /
      // ops roles — patients should never appear, even if a future api
      // change loosens the filter on the server side.
      const others = (data as Provider[]).filter((p) =>
        PROVIDER_ROLES.has(p.role),
      );
      const self: Provider | null = session?.user
        ? {
            id: session.user.id,
            name: session.user.email ?? 'You',
            email: session.user.email ?? null,
            role: session.user.role,
          }
        : null;
      const merged = self && PROVIDER_ROLES.has(session!.user.role)
        ? [self, ...others]
        : others;
      return merged;
    },
  });
}
