import { useSyncExternalStore } from 'react';
import { getSession, subscribeSession, type Session } from './session';

const NULL_SESSION: Session | null = null;

/**
 * useSyncExternalStore-backed hook so any component re-renders when the
 * session changes (login/logout) without prop-drilling.
 */
export function useSession(): Session | null {
  return useSyncExternalStore(
    subscribeSession,
    getSession,
    () => NULL_SESSION, // server snapshot — irrelevant on RN but TS wants it
  );
}
