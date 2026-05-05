'use client';

import { useSyncExternalStore } from 'react';
import { loadSession, subscribeSession, type Session } from '../session';

// Server snapshot is null — anonymous on first render is the safe default
// for a client-only session store. Avoids hydration mismatches.
const serverSnapshot = (): Session | null => null;

export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, loadSession, serverSnapshot);
}
