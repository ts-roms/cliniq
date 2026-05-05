import AsyncStorage from '@react-native-async-storage/async-storage';

// Session store with AsyncStorage persistence + sync in-memory cache.
// The cache is what useSyncExternalStore reads on every render — AsyncStorage
// is async-only, so we keep a synchronous mirror seeded by hydrateSession()
// at app boot. Writes are fire-and-forget to keep UI snappy.

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
 * Read AsyncStorage once at app boot. Resolves regardless of success — a
 * corrupt or missing entry just leaves the cache null.
 */
export async function hydrateSession(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) cached = JSON.parse(raw) as Session;
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
  void AsyncStorage.setItem(KEY, JSON.stringify(session)).catch(() => undefined);
}

export function clearSession(): void {
  cached = null;
  notify();
  void AsyncStorage.removeItem(KEY).catch(() => undefined);
}

export function subscribeSession(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
