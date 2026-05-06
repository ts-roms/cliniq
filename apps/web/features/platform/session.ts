// Platform admin session — separate from the tenant session in features/auth.
// Stored under a distinct localStorage key so a clinic user and a platform
// admin can stay logged in side-by-side in the same browser without
// stepping on each other.

const KEY = 'cliniq.platform-session';
const EVENT = 'cliniq:platform-session';

export interface PlatformSession {
  accessToken: string;
  refreshToken: string;
  admin: {
    id: string;
    email: string;
  };
}

let cached: PlatformSession | null | undefined;

function read(): PlatformSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformSession;
  } catch {
    return null;
  }
}

export function loadPlatformSession(): PlatformSession | null {
  if (cached === undefined) cached = read();
  return cached;
}

export function savePlatformSession(session: PlatformSession): void {
  if (typeof window === 'undefined') return;
  cached = session;
  window.localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: session }));
}

export function clearPlatformSession(): void {
  if (typeof window === 'undefined') return;
  cached = null;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: null }));
}

export function subscribePlatformSession(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => {
    cached = read();
    callback();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
