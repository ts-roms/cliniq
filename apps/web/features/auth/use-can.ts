'use client';

import { useCallback } from 'react';
import { can, type Action, type Role } from '@org/shared-types';
import { useSession } from './hooks/use-session';

/**
 * Role-based UI gating, backed by the same matrix the api enforces with
 * @Requires(). Use it to hide sections and actions the signed-in role would
 * only get a 403 for — never as the security boundary (that stays server
 * side). The role comes from the session because it is baked into the JWT;
 * a role change already forces a new sign-in.
 */
export function useCan(): (action: Action) => boolean {
  const session = useSession();
  const role = session?.user.role as Role | undefined;
  return useCallback(
    (action: Action) => (role ? can(role, action) : false),
    [role],
  );
}
