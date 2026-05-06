// Tiny client-side session store with an external-store interface so
// `useSyncExternalStore` can subscribe without any useEffect boilerplate.
// Backed by localStorage for the MVP — swap for httpOnly cookies + a Next.js
// Route Handler when you wire SSR auth properly.

const KEY = 'cliniq.session';
const EVENT = 'cliniq:session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    tenantId: string;
    /** Tenant discriminator — drives which UI shell (clinic vs lab) is shown. */
    tenantKind?: 'CLINIC' | 'LAB';
    role: string;
    /** Set only for PATIENT role (portal accounts). */
    patientId?: string | null;
  };
}

let cached: Session | null | undefined; // undefined = not yet read

function read(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function loadSession(): Session | null {
  if (cached === undefined) cached = read();
  return cached;
}

export function saveSession(session: Session): void {
  if (typeof window === 'undefined') return;
  cached = session;
  window.localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: session }));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  cached = null;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: null }));
}

export function subscribeSession(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => {
    cached = read();
    callback();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler); // cross-tab sync
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
