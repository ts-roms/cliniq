'use client';

import { useCallback } from 'react';
import { authControllerLogout } from '@org/api-client';
import { clearSession, loadSession } from '../session';

/**
 * Sign out = revoke the refresh session server-side, then drop the local
 * one. The api call is best-effort (network down / already-expired token
 * must never trap the user in a signed-in state), and the local clear
 * happens regardless.
 */
export function useLogout(onDone?: () => void) {
  return useCallback(async () => {
    const session = loadSession();
    if (session?.refreshToken) {
      try {
        await authControllerLogout({
          body: { refreshToken: session.refreshToken },
        });
      } catch {
        // ignore — see above
      }
    }
    clearSession();
    onDone?.();
  }, [onDone]);
}
