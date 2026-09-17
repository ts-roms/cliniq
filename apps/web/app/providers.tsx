'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  configureActingAs,
  configureAutoRefresh,
  configureCookies,
  client,
} from '@org/api-client';
import { useState, type ReactNode } from 'react';
import { clearSession } from '@/features/auth';
import { getActingAs } from '@/features/delegations/acting-as';

// Configure the API client once at module load (runs in browser only because
// 'use client'). The web client uses httpOnly cookies — `configureCookies()`
// sets `credentials: 'include'` on every request so the browser sends the
// session cookies automatically. We no longer pass tokens via JS.
// Use `||` (not `??`) so an empty-string NEXT_PUBLIC_API_URL also falls back
// to the default. An empty value silently produces same-origin requests
// (page on :3000 → /api/auth/login → 404), which is hard to spot.
client.setConfig({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
});
configureCookies();
configureActingAs(() => getActingAs());

// Auto-refresh still works — the api accepts the refresh token via the
// `cliniq.refresh` httpOnly cookie (preferred) or in the JSON body
// (mobile). On 401, the api-client POSTs to /auth/refresh with an empty
// body; the cookie gets read server-side, fresh cookies are issued, and
// the original request is retried.
configureAutoRefresh({
  getRefreshToken: () => 'cookie',
  onRefreshed: () => {
    /* nothing — the api Set-Cookie'd the new pair */
  },
  onRefreshFailed: () => {
    clearSession();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
