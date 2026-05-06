import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Session store with SecureStore persistence + sync in-memory cache.
//
// SecureStore wraps the device keychain (iOS) or Keystore-backed shared prefs
// (Android), so refresh tokens are encrypted at rest and survive only as long
// as the install — uninstalling the app removes them. This is meaningfully
// stronger than AsyncStorage (which is plain SQLite/files readable by any
// process with the app's data dir, e.g. on rooted devices or after a backup).
//
// We keep the same getSession()/saveSession()/clearSession()/subscribeSession()
// surface as before so callers don't change. hydrateSession() is async-only;
// the cache is what useSyncExternalStore reads each render.
//
// First-run migration: a session previously written via AsyncStorage is read
// once at hydrate time, copied to SecureStore, and removed from AsyncStorage
// so existing logged-in users don't get bounced back to /login on upgrade.

const KEY = 'cliniq.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    tenantId: string;
    role: string;
    patientId?: string | null;
  };
}

let cached: Session | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

export function getSession(): Session | null {
  return cached;
}

export function isHydrated(): boolean {
  return hydrated;
}

/**
 * Read SecureStore once at app boot. Falls back to AsyncStorage and migrates
 * forward on first hit so existing installs aren't logged out on upgrade.
 * Resolves regardless of success — a corrupt or missing entry just leaves the
 * cache null.
 */
export async function hydrateSession(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) {
      cached = JSON.parse(raw) as Session;
    } else {
      // First-run migration from AsyncStorage. Best-effort.
      try {
        const legacy = await AsyncStorage.getItem(KEY);
        if (legacy) {
          cached = JSON.parse(legacy) as Session;
          await SecureStore.setItemAsync(KEY, legacy);
          await AsyncStorage.removeItem(KEY);
        }
      } catch {
        // ignore — fresh install
      }
    }
  } catch {
    cached = null;
  } finally {
    hydrated = true;
    notify();
  }
}

export function saveSession(session: Session): void {
  cached = session;
  notify();
  // Fire-and-forget. If the write fails the user re-logs in next launch;
  // not catastrophic.
  void SecureStore.setItemAsync(KEY, JSON.stringify(session)).catch(() => undefined);
}

export function clearSession(): void {
  cached = null;
  notify();
  void SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}

export function subscribeSession(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
