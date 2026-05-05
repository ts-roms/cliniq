'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  configureActingAs,
  configureAuth,
  configureAutoRefresh,
  client,
} from '@org/api-client';
import { useState, type ReactNode } from 'react';
import { clearSession, loadSession, saveSession } from '@/features/auth';
import { getActingAs } from '@/features/delegations/acting-as';

// Configure the API client once at module load (runs in browser only because
// 'use client'). Token getter is bound to the session store; saveSession() and
// clearSession() update the cache so subsequent requests pick up the new token
// without us having to re-register the interceptor.
client.setConfig({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
});
configureAuth(() => loadSession()?.accessToken ?? null);
configureActingAs(() => getActingAs());
configureAutoRefresh({
  getRefreshToken: () => loadSession()?.refreshToken ?? null,
  onRefreshed: ({ accessToken, refreshToken }) => {
    const current = loadSession();
    if (!current) return;
    saveSession({ ...current, accessToken, refreshToken });
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
