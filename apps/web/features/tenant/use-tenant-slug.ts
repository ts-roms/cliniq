'use client';

// Client-side tenant slug reader. Reads the cookie set by middleware.ts.
// For server components, read req.headers.get('x-cliniq-tenant') instead.

const COOKIE = 'cliniq_tenant';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function useTenantSlug(): string | null {
  // Cookie is set on the very first request — safe to read on every render.
  return readCookie(COOKIE);
}
