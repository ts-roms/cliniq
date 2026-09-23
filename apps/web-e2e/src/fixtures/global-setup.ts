import {
  chromium,
  request,
  type FullConfig,
  type Page,
} from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { provisionTenants, type ProvisionedSeed } from './provision';
import { sessionPath, type SessionRole } from './sessions';

/**
 * One-time bootstrap before any spec runs. Two responsibilities:
 *
 *   1. Provision test fixtures via the api: a CLINIC tenant (with OWNER,
 *      DOCTOR, RECEPTIONIST, PATIENT users), a LAB tenant, a PLATFORM
 *      admin. Returns email/password pairs.
 *
 *   2. Drive each user through /login in a real browser, capture the
 *      resulting cookie jar via `context.storageState({ path })`, and
 *      write to `apps/web-e2e/storage/<role>.json`.
 *
 * Specs reference those storage files via `test.use({ storageState })` and
 * skip login entirely. Saves ~6s per spec on a cold run.
 *
 * Stable seed identifiers (`SEED_TAG=cliniq-webe2e-<runId>`) get written to
 * disk so teardown (or a future cleanup script) can reach them. We don't
 * delete tenants between runs — they're ~free in the dev DB and concurrent
 * shards would otherwise stomp each other.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL =
    (config.projects[0].use.baseURL as string | undefined) ??
    'http://localhost:4000';
  const apiURL = process.env.API_E2E_URL ?? 'http://localhost:4005';

  // 1. Provision test data via the api.
  const api = await request.newContext({ baseURL: apiURL });
  const seed = await provisionTenants(api);
  await api.dispose();

  // 2. Drive a login per (project, role) so every project owns its own
  //    session row. Sharing one made refresh-token rotation cross-project:
  //    the first project to refresh invalidated the rest. See sessions.ts.
  const wanted = plannedSessions(config);
  const browser = await chromium.launch();
  await Promise.all(
    wanted.map(({ role, path }) =>
      captureSession(browser, baseURL, seed, role, path),
    ),
  );
  await browser.close();
  console.log(
    `  captured ${wanted.length} session(s) across ` +
      `${new Set(wanted.map((w) => w.project)).size} project(s)`,
  );

  // Drop the seed payload so individual specs can reach test data (e.g. a
  // pre-seeded patient id) without re-provisioning. Path is gitignored.
  await writeJson(`${process.cwd()}/storage/seed.json`, seed);
}

async function captureWebSession(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  user: { email: string; password: string },
  statePath: string,
): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const stop = recordAuthTraffic(page);
  await page.goto(`${baseURL}/login`);
  await fillEmailAndPassword(page, user.email, user.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Login success redirects into the authed shell.
  await waitForPostLoginRedirect(page, statePath, '/login', stop);
  const path = `${process.cwd()}/${statePath}`;
  await mkdir(dirname(path), { recursive: true });
  await ctx.storageState({ path });
  await ctx.close();
}

async function capturePortalSession(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  user: { email: string; password: string },
  statePath: string,
): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const stop = recordAuthTraffic(page);
  await page.goto(`${baseURL}/portal/login`);
  await fillEmailAndPassword(page, user.email, user.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await waitForPostLoginRedirect(page, statePath, '/portal/login', stop);
  const path = `${process.cwd()}/${statePath}`;
  await mkdir(dirname(path), { recursive: true });
  await ctx.storageState({ path });
  await ctx.close();
}

async function capturePlatformSession(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  admin: { email: string; password: string },
  statePath: string,
): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const stop = recordAuthTraffic(page);
  await page.goto(`${baseURL}/platform/login`);
  await fillEmailAndPassword(page, admin.email, admin.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await waitForPostLoginRedirect(page, statePath, '/platform/login', stop);
  const path = `${process.cwd()}/${statePath}`;
  await mkdir(dirname(path), { recursive: true });
  await ctx.storageState({ path });
  await ctx.close();
}

/**
 * Listens for /auth/login responses on a page so failures can show what the
 * api actually returned. Returns a tear-down that resolves the captured
 * payloads (best-effort — never throws).
 */
function recordAuthTraffic(page: Page): () => Promise<AuthResponseLog[]> {
  const log: AuthResponseLog[] = [];
  const onResponse = async (res: import('@playwright/test').Response) => {
    const url = res.url();
    if (!/\/(api\/)?(platform\/)?auth\/login/.test(url)) return;
    let bodySnippet: string | null = null;
    try {
      bodySnippet = (await res.text()).slice(0, 500);
    } catch {
      bodySnippet = '(unreadable body)';
    }
    log.push({ url, status: res.status(), body: bodySnippet });
  };
  const onFailed = (req: import('@playwright/test').Request) => {
    const url = req.url();
    if (!/\/(api\/)?(platform\/)?auth\/login/.test(url)) return;
    log.push({
      url,
      status: 0,
      body: `request failed: ${req.failure()?.errorText ?? 'unknown'}`,
    });
  };
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  return async () => {
    page.off('response', onResponse);
    page.off('requestfailed', onFailed);
    return log;
  };
}

interface AuthResponseLog {
  url: string;
  status: number;
  body: string | null;
}

/**
 * Wait for the post-login redirect, and on timeout dump everything we can
 * to make the failure self-explanatory: screenshot, page HTML, current URL,
 * visible alert text, captured /auth/login responses, and a hint list of
 * the usual culprits (api not up, CORS, NEXT_PUBLIC_API_URL, SameSite).
 */
async function waitForPostLoginRedirect(
  page: Page,
  label: string,
  loginPath: string,
  collectAuthLog: () => Promise<AuthResponseLog[]>,
): Promise<void> {
  try {
    await page.waitForURL((url) => !url.pathname.endsWith(loginPath), {
      timeout: 20_000,
    });
  } catch (err) {
    const dir = `${process.cwd()}/test-results/global-setup`;
    await mkdir(dir, { recursive: true }).catch(() => undefined);
    // `label` is now a storage path, so flatten its separators for a filename.
    const stamp = `${label.replace(/[\\/]/gu, '_')}-${Date.now()}`;
    const pngPath = `${dir}/${stamp}.png`;
    const htmlPath = `${dir}/${stamp}.html`;
    await page
      .screenshot({ path: pngPath, fullPage: true })
      .catch(() => undefined);
    await page
      .content()
      .then((html) => writeFile(htmlPath, html, 'utf-8'))
      .catch(() => undefined);

    const currentUrl = page.url();
    const alertText = await page
      .getByRole('alert')
      .first()
      .textContent({ timeout: 1_000 })
      .catch(() => null);
    const buttonText = await page
      .getByRole('button', { name: /sign in|log in|signing in/i })
      .first()
      .textContent({ timeout: 1_000 })
      .catch(() => null);
    const authLog = await collectAuthLog().catch(() => [] as AuthResponseLog[]);

    const apiUrl = process.env.API_E2E_URL ?? 'http://localhost:4005';
    const webUrl = process.env.WEB_E2E_BASE_URL ?? 'http://localhost:4000';

    const formatted = [
      `[global-setup:${label}] login did not redirect away from ${loginPath} within 20s.`,
      `  current URL  : ${currentUrl}`,
      `  button text  : ${buttonText ?? '(not found)'}`,
      `  alert text   : ${alertText?.trim() || '(no alert visible)'}`,
      `  auth traffic : ${
        authLog.length === 0
          ? '(no /auth/login requests observed — form likely never submitted, or NEXT_PUBLIC_API_URL points elsewhere)'
          : authLog
              .map((r) => `\n    - ${r.status} ${r.url}\n      ${r.body ?? ''}`)
              .join('')
      }`,
      `  screenshot   : ${pngPath}`,
      `  html dump    : ${htmlPath}`,
      ``,
      `  Most common causes:`,
      `   1. api not running on ${apiUrl} (try: curl ${apiUrl}/api/health)`,
      `   2. web env: NEXT_PUBLIC_API_URL not pointing at ${apiUrl} (apps/web/.env.local)`,
      `   3. api CORS not allowing origin ${webUrl} with credentials (api CORS config)`,
      `   4. cookie SameSite=Strict blocking cross-origin Set-Cookie (relax to Lax for dev)`,
      ``,
      `  Original error: ${(err as Error).message}`,
    ].join('\n');

    throw new Error(formatted);
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Fill the email + password fields in the login form, falling back through
 * label → placeholder → input[type] selectors so a missing htmlFor on
 * either field doesn't block setup. Real fix lives in FormField.
 */
async function fillEmailAndPassword(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
): Promise<void> {
  const emailLocator = page
    .getByLabel(/email/i)
    .or(page.getByPlaceholder(/@|email/i))
    .or(page.locator('input[type="email"]'))
    .or(page.locator('#email'))
    .first();
  await emailLocator.fill(email);

  const passwordLocator = page
    .getByLabel(/password/i)
    .or(page.getByPlaceholder(/password/i))
    .or(page.locator('input[type="password"]'))
    .or(page.locator('#password'))
    .first();
  await passwordLocator.fill(password);
}

export type Seed = ProvisionedSeed;

/**
 * Every (project, role) pair that needs a signed-in session, read off the
 * project list rather than hardcoded — a project added to the config gets its
 * sessions without touching this file, and one that declares a role its specs
 * never use only costs a login.
 */
function plannedSessions(
  config: FullConfig,
): Array<{ project: string; role: SessionRole; path: string }> {
  const out: Array<{ project: string; role: SessionRole; path: string }> = [];
  const seen = new Set<string>();
  for (const project of config.projects) {
    const roles = (project.metadata as { roles?: SessionRole[] } | undefined)
      ?.roles;
    if (!roles?.length) continue; // e.g. chromium-public, which is anonymous
    for (const role of roles) {
      const path = sessionPath(project.name, role);
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ project: project.name, role, path });
    }
  }
  return out;
}

/** Route a role to the right login page and seed user. */
async function captureSession(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  seed: ProvisionedSeed,
  role: SessionRole,
  path: string,
): Promise<void> {
  switch (role) {
    case 'clinicOwner':
      return captureWebSession(browser, baseURL, seed.clinic.owner, path);
    case 'clinicDoctor':
      return captureWebSession(browser, baseURL, seed.clinic.doctor, path);
    case 'clinicReceptionist':
      return captureWebSession(
        browser,
        baseURL,
        seed.clinic.receptionist,
        path,
      );
    case 'labOwner':
      return captureWebSession(browser, baseURL, seed.lab.owner, path);
    case 'patient':
      return capturePortalSession(browser, baseURL, seed.clinic.patient, path);
    case 'platformAdmin':
      return capturePlatformSession(browser, baseURL, seed.platform, path);
  }
}
