import { client } from './generated/client.gen';

type TokenGetter = () => string | null | Promise<string | null>;
type RefreshGetter = () => string | null | Promise<string | null>;
type ActingAsGetter = () => string | null | Promise<string | null>;

/**
 * What the refresh endpoint returns. Subset of the login payload — we only
 * need the new tokens; user identity is unchanged.
 */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

type OnRefreshed = (tokens: RefreshedTokens) => void | Promise<void>;
type OnRefreshFailed = () => void | Promise<void>;

let installed = false;

/**
 * Inject a function that returns the current access token. Called on every
 * outgoing request. Web (Next.js): pull from session/cookies. Mobile (Expo):
 * pull from SecureStore.
 *
 * Safe to call multiple times — only one interceptor is registered.
 */
export function configureAuth(getToken: TokenGetter): void {
  if (installed) return;
  installed = true;
  client.interceptors.request.use(async (request) => {
    const token = await getToken();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  });
}

let actingAsInstalled = false;

/**
 * Attach an X-Acting-For header on every outgoing request when the caller
 * has opted into a delegation. The api validates this against an active
 * Delegation row and overrides the request's effective role on the server.
 *
 * Safe to call multiple times — only one interceptor is registered.
 */
export function configureActingAs(getActingAs: ActingAsGetter): void {
  if (actingAsInstalled) return;
  actingAsInstalled = true;
  client.interceptors.request.use(async (request) => {
    const actingFor = await getActingAs();
    if (actingFor) request.headers.set('X-Acting-For', actingFor);
    else request.headers.delete('X-Acting-For');
    return request;
  });
}

let refreshInstalled = false;

/**
 * Wires up auto-refresh on 401. When a request comes back 401:
 *   1. Call POST /api/auth/refresh with the current refresh token.
 *   2. If refresh succeeds: persist via onRefreshed and retry the original request.
 *   3. If refresh fails (or no refresh token): call onRefreshFailed (e.g. to clear
 *      session + redirect to /login) and return the original 401 response.
 *
 * Concurrent 401s share a single in-flight refresh promise to avoid stampedes.
 *
 * Pre-req: the access-token getter passed to configureAuth() must read from
 * the same store that onRefreshed writes to, so retried requests pick up the
 * new token.
 */
export function configureAutoRefresh(opts: {
  getRefreshToken: RefreshGetter;
  onRefreshed: OnRefreshed;
  onRefreshFailed?: OnRefreshFailed;
  /** Path of the refresh endpoint relative to the base URL. */
  refreshPath?: string;
}): void {
  if (refreshInstalled) return;
  refreshInstalled = true;

  const refreshPath = opts.refreshPath ?? '/api/auth/refresh';
  let inflight: Promise<RefreshedTokens | null> | null = null;

  async function doRefresh(): Promise<RefreshedTokens | null> {
    const token = await opts.getRefreshToken();
    if (!token) return null;

    const config = client.getConfig();
    const base = String(config.baseUrl ?? '').replace(/\/$/, '');
    const url = `${base}${refreshPath}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as RefreshedTokens;
      if (!json?.accessToken || !json?.refreshToken) return null;
      return json;
    } catch {
      return null;
    }
  }

  client.interceptors.response.use(async (response, request) => {
    if (response.status !== 401) return response;
    // Don't try to refresh the refresh call itself.
    if (request.url.endsWith(refreshPath)) return response;
    // Only retry once per request.
    if (request.headers.get('x-cliniq-retry') === '1') return response;

    if (!inflight) inflight = doRefresh().finally(() => { inflight = null; });
    const next = await inflight;

    if (!next) {
      try {
        await opts.onRefreshFailed?.();
      } catch {
        // swallow
      }
      return response;
    }

    try {
      await opts.onRefreshed(next);
    } catch {
      // swallow
    }

    // Retry the original request with the new token. We rebuild a new Request
    // because Headers/Body are otherwise consumed.
    const retried = new Request(request, {
      headers: new Headers(request.headers),
    });
    retried.headers.set('Authorization', `Bearer ${next.accessToken}`);
    retried.headers.set('x-cliniq-retry', '1');

    try {
      const fresh = await fetch(retried);
      return fresh;
    } catch {
      return response;
    }
  });
}

export async function authHeader(getToken: TokenGetter): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
