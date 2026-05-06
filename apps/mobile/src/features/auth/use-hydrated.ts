import { useEffect, useState } from 'react';
import { hydrateSession, isHydrated } from './session';

/**
 * Returns `true` once the persisted session has been read from SecureStore
 * (with a one-shot fallback migration from legacy AsyncStorage for installs
 * upgrading across the storage backend change). Mount once at the app root
 * and gate the router on this so we don't flash the LoginScreen for
 * already-signed-in users.
 */
export function useHydrated(): boolean {
  const [ready, setReady] = useState(isHydrated());
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void hydrateSession().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}
