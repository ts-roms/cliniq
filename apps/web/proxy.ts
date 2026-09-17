import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantSlug } from './features/tenant/resolve-subdomain';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'cliniq.app';
const TENANT_HEADER = 'x-cliniq-tenant';
const TENANT_COOKIE = 'cliniq_tenant';
const ACCESS_COOKIE = 'cliniq.access';
const PLATFORM_ACCESS_COOKIE = 'cliniq.platform.access';

/**
 * Path prefixes that require a session cookie to enter. The check is a
 * presence-only sniff — the api revalidates the JWT on every request, so
 * forging this cookie buys you nothing. The goal here is to avoid flashing
 * the authed shell to anonymous users and to keep them out of pages that
 * would otherwise spawn 401-storm fetches on mount.
 */
const PROTECTED_PREFIXES: ReadonlyArray<readonly [string, string, string]> = [
  // [prefix, required cookie, redirect-to-on-miss]
  ['/dashboard', ACCESS_COOKIE, '/login'],
  ['/patients', ACCESS_COOKIE, '/login'],
  ['/consultations', ACCESS_COOKIE, '/login'],
  ['/schedule', ACCESS_COOKIE, '/login'],
  ['/queue', ACCESS_COOKIE, '/login'],
  ['/inventory', ACCESS_COOKIE, '/login'],
  ['/notifications', ACCESS_COOKIE, '/login'],
  ['/audit', ACCESS_COOKIE, '/login'],
  ['/admin', ACCESS_COOKIE, '/login'],
  ['/lab-cases', ACCESS_COOKIE, '/login'],
  ['/lab-invoices', ACCESS_COOKIE, '/login'],
  ['/lab-invitations', ACCESS_COOKIE, '/login'],
  ['/lab/', ACCESS_COOKIE, '/login'],
  ['/platform/dashboard', PLATFORM_ACCESS_COOKIE, '/platform/login'],
  ['/platform/tenants', PLATFORM_ACCESS_COOKIE, '/platform/login'],
];

// Portal pages that are authed (the /portal/login + /portal/signup pages
// stay anonymous). We allowlist the public portal pages instead of
// blocklisting the authed ones — easier to keep in sync.
const PORTAL_PUBLIC = new Set(['/portal/login', '/portal/signup']);

/**
 * Edge proxy: resolves a tenant slug from the request host (e.g.
 * `acme.cliniq.app`) and enforces auth on protected route groups.
 *
 * Cookie-based gating: the api sets httpOnly `cliniq.access` and
 * `cliniq.platform.access` cookies on /auth/login. We only check presence
 * here — the api validates the JWT, RBAC, and tenant scope on every call.
 */
export function proxy(req: NextRequest) {
  const slug = resolveTenantSlug(req.headers.get('host'), ROOT_DOMAIN);
  const pathname = req.nextUrl.pathname;

  // ── Auth enforcement ──────────────────────────────────────
  const matched = PROTECTED_PREFIXES.find(([prefix]) =>
    pathname.startsWith(prefix),
  );
  if (matched) {
    const [, cookieName, redirectTo] = matched;
    if (!req.cookies.get(cookieName)) {
      const url = req.nextUrl.clone();
      url.pathname = redirectTo;
      // Preserve where the user wanted to go so /login can bounce them back.
      url.searchParams.set('next', pathname + req.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }
  // Portal: anything under /portal except /portal/login and /portal/signup
  // needs a tenant access cookie. The `/portal/tele/[token]` route is also
  // gated — even tokenized join pages assume the patient is signed in.
  if (
    pathname.startsWith('/portal') &&
    !PORTAL_PUBLIC.has(pathname) &&
    !req.cookies.get(ACCESS_COOKIE)
  ) {
    const url = req.nextUrl.clone();
    url.pathname = '/portal/login';
    url.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // ── Tenant subdomain plumbing (kept verbatim from before) ──
  if (!slug) return NextResponse.next();

  if (pathname === '/') {
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
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
