import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantSlug } from './features/tenant/resolve-subdomain';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'cliniq.app';
const TENANT_HEADER = 'x-cliniq-tenant';
const TENANT_COOKIE = 'cliniq_tenant';

/**
 * Edge middleware: resolves a tenant slug from the request host (e.g.
 * `acme.cliniq.app`) and exposes it to downstream code in three ways:
 *
 *   1. Request header `x-cliniq-tenant` — read from server components / route handlers
 *   2. Cookie `cliniq_tenant` — read from client components after the first request
 *   3. Rewrite to `/<slug>/...` — only when explicitly opted in via TENANT_PATH_REWRITE
 *      env var. We default to OFF because the App Router's existing `/(app)` group
 *      doesn't have tenant segments yet.
 *
 * The api-side `TenantContextMiddleware` is the source of truth for security —
 * this middleware just plumbs the slug for UX (e.g., showing the clinic name
 * in the header before the user has logged in).
 */
export function middleware(req: NextRequest) {
  const slug = resolveTenantSlug(req.headers.get('host'), ROOT_DOMAIN);

  // No tenant subdomain → carry on. Anonymous landings on the root domain
  // hit the marketing page at /, /login, etc. without rewrites.
  if (!slug) return NextResponse.next();

  // Tenant subdomain root → marketing landing is wrong UX; send to /login.
  // Logged-in users get bounced onward by the app shell. Edge can't read
  // localStorage, so we always redirect — the brief flash through /login is
  // acceptable.
  if (req.nextUrl.pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    const redirect = NextResponse.redirect(url);
    redirect.cookies.set(TENANT_COOKIE, slug, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return redirect;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(TENANT_HEADER, slug);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(TENANT_COOKIE, slug, {
    httpOnly: false,         // readable from client components (UX only)
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export const config = {
  // Skip Next internals + static + the root favicon. Everything else passes through.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
