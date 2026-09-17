// Platform admin session — separate from the tenant session in features/auth.
// Stored under a distinct localStorage key so a clinic user and a platform
// admin can stay logged in side-by-side in the same browser without
// stepping on each other.
//
// JWTs live in the httpOnly `cliniq.platform.access` / `cliniq.platform.refresh`
// cookies. localStorage only holds the admin identity for UI shell decisions
// (e.g., "show platform nav?"). Tolerate the older shape that included tokens
// — they're dropped on read.

const KEY = 'cliniq.platform-session';
const EVENT = 'cliniq:platform-session';

export interface PlatformAdminIdentity {
  id: string;
  email: string;
}

export interface PlatformLoginPayload {
  accessToken?: string;
  refreshToken?: string;
  admin: PlatformAdminIdentity;
}

export interface PlatformSession {
  admin: PlatformAdminIdentity;
}

let cached: PlatformSession | null | undefined;

function read(): PlatformSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PlatformSession> & {
      accessToken?: unknown;
      refreshToken?: unknown;
    };
    if (!parsed?.admin) return null;
    return { admin: parsed.admin };
  } catch {
    return null;
  }
}

export function loadPlatformSession(): PlatformSession | null {
  if (cached === undefined) cached = read();
  return cached;
}

export function savePlatformSession(
  payload: PlatformLoginPayload | PlatformSession,
): void {
  if (typeof window === 'undefined') return;
  const next: PlatformSession = { admin: payload.admin };
  cached = next;
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
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
