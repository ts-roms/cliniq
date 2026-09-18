// A dedicated `Client` instance for the platform admin audience.
//
// Why a separate client (and not the global `@org/api-client`):
//   - The global client's `configureAutoRefresh` interceptor refreshes against
//     `/api/auth/refresh` and on failure clears the TENANT session + redirects
//     to `/login`. That's wrong for platform admins, who:
//       1. Refresh via `/api/platform/auth/refresh` (different cookie jar,
//          different JWT audience).
//       2. Should land on `/platform/login` on auth failure, not `/login`.
//
// The interceptor here mirrors the shape of `configureAutoRefresh` but is
// scoped to this instance so it can never interfere with tenant flows.
//
// Cookies: `credentials: 'include'` means the browser auto-attaches the
// `cliniq.platform.access` cookie on every call to `/api/platform/...` and
// accepts the `Set-Cookie` headers issued by login/refresh. JS never sees
// the tokens — they stay httpOnly.

import { createClient, createConfig } from '@org/api-client';
import { clearPlatformSession } from '../session';

const BASE_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4005';

export const platformClient = createClient(
  createConfig({
    baseUrl: BASE_URL,
    credentials: 'include',
  }),
);

const REFRESH_PATH = '/api/platform/auth/refresh';
let refreshInflight: Promise<boolean> | null = null;

async function refreshPlatformSession(): Promise<boolean> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      const res = await fetch(`${BASE_URL}${REFRESH_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInflight = null;
  });
  return refreshInflight;
}

// Install the 401-refresh-and-retry interceptor on this client only.
platformClient.interceptors.response.use(async (response, request) => {
  if (response.status !== 401) return response;
  // Don't loop on the refresh call itself.
  if (request.url.endsWith(REFRESH_PATH)) return response;
  // Each request is retried at most once.
  if (request.headers.get('x-cliniq-platform-retry') === '1') return response;

  const refreshed = await refreshPlatformSession();
  if (!refreshed) {
    clearPlatformSession();
    if (
      typeof window !== 'undefined' &&
      !window.location.pathname.endsWith('/platform/login')
    ) {
      window.location.href = '/platform/login';
    }
    return response;
  }

  // Retry the original request. Build a new Request because Headers/Body
  // are otherwise consumed.
  const retried = new Request(request, {
    headers: new Headers(request.headers),
  });
  retried.headers.set('x-cliniq-platform-retry', '1');
  try {
    return await fetch(retried);
  } catch {
    return response;
  }
});
