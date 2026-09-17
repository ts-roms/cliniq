// Web session store. Backed by localStorage for the UI's "do we have a
// session?" signal only — the actual JWTs live in httpOnly cookies so XSS
// can't read them. We persist the public-ish user metadata (id, email,
// tenant, role) here because the UI needs it before the first /auth/me
// round-trip to decide which shell to render.

const KEY = 'cliniq.session';
const EVENT = 'cliniq:session';

export interface SessionUser {
  id: string;
  email: string;
  tenantId: string;
  /** Tenant discriminator — drives which UI shell (clinic vs lab) is shown. */
  tenantKind?: 'CLINIC' | 'LAB';
  role: string;
  /** Set only for PATIENT role (portal accounts). */
  patientId?: string | null;
  /** Clinic-side plan (STARTER/PRO/PREMIUM). Null for lab tenants. */
  plan?: 'STARTER' | 'PRO' | 'PREMIUM' | null;
  /** Lab-side plan ladder. Null for clinic tenants. */
  labPlan?: 'LAB_BASIC' | 'LAB_STANDARD' | 'LAB_PREMIUM' | null;
}

/**
 * Session payload the API hands back on /auth/login. Tokens are present in
 * the JSON for mobile (Expo) clients; the web client ignores the tokens
 * (cookies carry them) and only persists the `user` metadata.
 */
export interface LoginPayload {
  accessToken?: string;
  refreshToken?: string;
  user: SessionUser;
}

export interface Session {
  user: SessionUser;
}

let cached: Session | null | undefined; // undefined = not yet read

function read(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session> & {
      // Tolerate the old shape that included tokens — they're ignored.
      accessToken?: unknown;
      refreshToken?: unknown;
    };
    if (!parsed?.user) return null;
    return { user: parsed.user };
  } catch {
    return null;
  }
}

export function loadSession(): Session | null {
  if (cached === undefined) cached = read();
  return cached;
}

export function saveSession(payload: LoginPayload | Session): void {
  if (typeof window === 'undefined') return;
  const next: Session = { user: payload.user };
  cached = next;
  // Only persist the user metadata. Tokens (if the api returned them for
  // mobile-style consumers) are intentionally dropped on the web — the api
  // already set httpOnly cookies that the browser will send back.
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
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
