'use client';

import { useCallback } from 'react';
import { platformAuthControllerLogout } from '@org/api-client';
import { clearPlatformSession } from '../session';

/**
 * Sign out of the operator console. Until this existed the button only
 * cleared localStorage, so the httpOnly cookies stayed in the browser and
 * the refresh token stayed valid for its full 7 days — "sign out" hid the
 * nav and nothing more. Now the server revokes the refresh session.
 *
 * Best-effort, like the tenant side: a network failure or an already-dead
 * session must never trap an admin in a signed-in shell, so the local clear
 * happens either way.
 */
export function usePlatformLogout(onDone?: () => void) {
  return useCallback(async () => {
    try {
      await platformAuthControllerLogout({ body: {} });
    } catch {
      // ignore — see above
    }
    clearPlatformSession();
    onDone?.();
  }, [onDone]);
}
