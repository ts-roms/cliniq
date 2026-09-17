'use client';

import { useCallback } from 'react';
import { authControllerLogout } from '@org/api-client';
import { clearSession } from '../session';

/**
 * Sign out = revoke the refresh session server-side and clear the httpOnly
 * cookies (the api reads `cliniq.refresh` itself — the browser never sees
 * the token), then drop the local user metadata. The api call is
 * best-effort: network down or an already-expired session must never trap
 * the user in a signed-in state, so the local clear happens regardless.
 */
export function useLogout(onDone?: () => void) {
  return useCallback(async () => {
    try {
      await authControllerLogout({ body: {} });
    } catch {
      // ignore — see above
    }
    clearSession();
    onDone?.();
  }, [onDone]);
}
