/**
 * Where the browser sends api calls.
 *
 * `NEXT_PUBLIC_API_URL` accepts an explicit `same-origin` sentinel, which
 * resolves to `''` so every call goes to the web's own origin and a Next
 * rewrite (see next.config.js) forwards `/api/*` to the api service.
 *
 * That indirection is not cosmetic. The api sets httpOnly session cookies
 * with no Domain attribute, so they are host-only to whichever host answered
 * the login. When the browser calls the api on its OWN hostname, the cookie
 * is stored against that hostname — and `apps/web/proxy.ts`, which gates the
 * protected routes, only ever sees cookies sent to the WEB host. It finds
 * nothing and bounces straight back to /login. Same-origin puts the cookie
 * where the guard can read it.
 *
 * It looks fine locally because web (:4000) and api (:4005) are both
 * `localhost` and cookies ignore the port, so the whole web-e2e suite passes
 * against a topology that does not exist in production.
 *
 * A bare empty value is still treated as "unset" and falls back to the local
 * default: an accidental empty env var producing silent same-origin 404s is
 * much harder to spot than a wrong absolute URL, so opting in has to be
 * deliberate.
 */
const SAME_ORIGIN = 'same-origin';
const LOCAL_DEFAULT = 'http://localhost:4005';

export function resolveApiBase(
  configured = process.env.NEXT_PUBLIC_API_URL,
): string {
  if (configured === SAME_ORIGIN) return '';
  return configured || LOCAL_DEFAULT;
}

/**
 * Base for string-concatenated URLs (`${API_BASE}/api/...`). Identical to
 * resolveApiBase(); named separately so call sites read clearly.
 */
export const API_BASE = resolveApiBase();
