#!/usr/bin/env node
/**
 * Synthetic login check against a deployed environment.
 *
 * Why this exists: on 2026-09-23 login was broken for every authed user on
 * Railway — clinic and platform — and nothing detected it. The api's own
 * /api/health kept returning 200 the whole time, because the api was fine.
 * What was broken was the SESSION: the cookie was being stored against the
 * api's hostname while apps/web/proxy.ts only reads cookies sent to the web's
 * hostname, so every protected route bounced back to /login. A human trying
 * to sign in was the detection mechanism.
 *
 * So this deliberately does not check /api/health. It signs in for real and
 * then uses the session, which is the only thing that would have caught it:
 *
 *   1. POST the login THROUGH THE WEB ORIGIN (not the api host) — that is the
 *      path a browser takes, and the one whose cookie scoping was wrong.
 *   2. Assert a session cookie came back.
 *   3. Fetch a PROTECTED WEB PAGE with that cookie, redirects disabled. A 307
 *      to /login is the failure signature; following redirects would turn it
 *      into a misleading 200.
 *   4. Fetch an authed API route through the same origin.
 *
 * Usage:
 *   SMOKE_BASE_URL=https://cliniq-lab.up.railway.app \
 *   SMOKE_EMAIL=... SMOKE_PASSWORD=... node tools/scripts/smoke-login.mjs
 *
 * Optional: SMOKE_PLATFORM_EMAIL / SMOKE_PLATFORM_PASSWORD also exercise the
 * platform console, which is a separate cookie and a separate login route.
 *
 * Use a dedicated smoke account, not a person's. It only needs to be able to
 * sign in and read one page.
 */

const BASE = (process.env.SMOKE_BASE_URL ?? '').replace(/\/$/, '');
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;
const PLATFORM_EMAIL = process.env.SMOKE_PLATFORM_EMAIL;
const PLATFORM_PASSWORD = process.env.SMOKE_PLATFORM_PASSWORD;
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 20_000);

/** Protected page + authed api route to prove the session actually works. */
const TENANT_PAGE = '/patients';
const TENANT_API = '/api/auth/me';
const PLATFORM_PAGE = '/platform/dashboard';

const failures = [];
function fail(step, detail) {
  failures.push(`${step}: ${detail}`);
  console.error(`  FAIL  ${step}\n        ${detail}`);
}
function pass(step, detail = '') {
  console.log(`  ok    ${step}${detail ? `  (${detail})` : ''}`);
}

async function req(path, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      redirect: 'manual', // a 307 to /login must surface, not be followed
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/** Collect `name=value` pairs from Set-Cookie, ignoring attributes. */
function jarFrom(res) {
  const raw =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
  const jar = new Map();
  for (const line of raw) {
    const [pair] = String(line).split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  return jar;
}

const cookieHeader = (jar) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

/**
 * One login → use-the-session round trip.
 * `label` distinguishes the tenant and platform shells in the output.
 */
async function checkSession({ label, loginPath, email, password, page, api }) {
  console.log(`\n${label}`);

  let res;
  try {
    res = await req(loginPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    fail(`${label} login`, `request failed: ${err.message}`);
    return;
  }

  if (res.status !== 200 && res.status !== 201) {
    // 404 here usually means the /api/* rewrite is not in place, which is a
    // different failure from bad credentials — say which.
    const hint =
      res.status === 404
        ? ' — /api/* is not being proxied by the web origin'
        : res.status === 401
          ? ' — credentials rejected'
          : '';
    fail(`${label} login`, `expected 200, got ${res.status}${hint}`);
    return;
  }
  pass(`${label} login`, `${res.status}`);

  const jar = jarFrom(res);
  if (jar.size === 0) {
    fail(
      `${label} session cookie`,
      'login succeeded but set no cookie on this origin',
    );
    return;
  }
  pass(`${label} session cookie`, [...jar.keys()].join(', '));

  // The assertion that matters: the session has to work on a protected page.
  const pageRes = await req(page, { headers: { cookie: cookieHeader(jar) } });
  if (pageRes.status === 200) {
    pass(`${label} ${page}`, '200');
  } else {
    const loc = pageRes.headers.get('location') ?? '';
    const hint = /login/.test(loc)
      ? ' — bounced back to login, so the guard cannot see the session cookie'
      : '';
    fail(
      `${label} ${page}`,
      `expected 200, got ${pageRes.status}${loc ? ` -> ${loc}` : ''}${hint}`,
    );
  }

  if (!api) return;
  const apiRes = await req(api, { headers: { cookie: cookieHeader(jar) } });
  if (apiRes.status === 200) pass(`${label} ${api}`, '200');
  else fail(`${label} ${api}`, `expected 200, got ${apiRes.status}`);
}

async function main() {
  if (!BASE) {
    console.error('SMOKE_BASE_URL is required (e.g. https://app.example.com)');
    process.exit(2);
  }
  if (!EMAIL || !PASSWORD) {
    console.error('SMOKE_EMAIL and SMOKE_PASSWORD are required');
    process.exit(2);
  }

  console.log(`Login smoke against ${BASE}`);

  await checkSession({
    label: 'tenant',
    loginPath: '/api/auth/login',
    email: EMAIL,
    password: PASSWORD,
    page: TENANT_PAGE,
    api: TENANT_API,
  });

  if (PLATFORM_EMAIL && PLATFORM_PASSWORD) {
    await checkSession({
      label: 'platform',
      loginPath: '/api/platform/auth/login',
      email: PLATFORM_EMAIL,
      password: PLATFORM_PASSWORD,
      page: PLATFORM_PAGE,
    });
  } else {
    console.log('\nplatform\n  skipped (SMOKE_PLATFORM_* not set)');
  }

  console.log('');
  if (failures.length > 0) {
    console.error(`${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log('All login checks passed.');
}

main().catch((err) => {
  console.error(`smoke-login crashed: ${err.stack ?? err.message}`);
  process.exit(1);
});
