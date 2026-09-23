import { defineConfig, devices } from '@playwright/test';
import { sessionPath, type SessionRole } from './src/fixtures/sessions';

/**
 * Playwright config for ClinIQ web e2e.
 *
 * Architecture:
 *   - `globalSetup` boots tenants + users via the api, drives /login in real
 *     browsers, and writes a storageState file per (role, portal). Specs
 *     pick up that state via `test.use({ storageState })` so login isn't
 *     repeated per-case (saves ~6s per spec).
 *   - Projects fan out across (browser × portal) so spec selection is fast
 *     and each project carries the right storage state by default.
 *   - The 4 responsive viewports are individual projects so a failure tells
 *     you exactly which size broke.
 *
 * Run locally:
 *   pnpm nx serve @org/api          # one terminal
 *   pnpm nx dev   @org/web          # another
 *   pnpm nx run @org/web-e2e:e2e    # third (or `--headed` to watch)
 *
 * In CI, the workflow boots both via `npm` calls so we don't need pnpm
 * inside the runner job.
 */
// Use `localhost` (not 127.0.0.1) so the browser origin matches what the api's
// CORS allowlist and the web's NEXT_PUBLIC_API_URL are built with. A mismatch
// here causes cross-origin login fetches to fail silently and login never
// redirects → 20s waitForURL timeout in global-setup.
const BASE_URL = process.env.WEB_E2E_BASE_URL ?? 'http://localhost:4000';
const isCI = !!process.env.CI;

/**
 * Sessions are per (project, role) rather than per role — see
 * src/fixtures/sessions.ts. `roles` lists every role a project's specs sign
 * in as, including ones reached via `testAs(...)`; globalSetup reads it to
 * decide which sessions to create, so a role missing here has no file.
 */
function authed(
  name: string,
  roles: readonly SessionRole[],
  use: Record<string, unknown>,
) {
  return {
    name,
    metadata: { roles: [...roles] },
    use: { ...use, storageState: sessionPath(name, roles[0]) },
  };
}

/**
 * Specs that must run signed OUT: login, signup, and anything named after
 * them (signup-choice.spec.ts). They run in `chromium-public`, which carries
 * no storageState, and are excluded from every authed clinic project — a
 * session there would turn the signup CTAs into "Go to dashboard".
 */
const ANON_SPECS = /(login|signup)(-[a-z0-9-]+)?\.spec\.ts$/;

/** Clinic specs run as the owner, and patient-roles.spec also as reception. */
const CLINIC_ROLES = ['clinicOwner', 'clinicReceptionist'] as const;

export default defineConfig({
  testDir: './src',
  outputDir: 'test-results',
  // Per-test timeout. Pages do TanStack Query work at mount and the api uses
  // bcrypt cost=12 — 30s leaves headroom without masking real hangs.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Fail the build on `test.only` to stop a debug commit from skipping CI.
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Workers: keep low to avoid stomping each other's tenants in the same DB.
  workers: isCI ? 2 : 1,
  reporter: isCI
    ? [['html', { open: 'never' }], ['github']]
    : [['html'], ['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: {
      // Help the api correlate logs with the test that produced them.
      'x-cliniq-test': 'web-e2e',
    },
    // Cookies are httpOnly + cross-origin (web on :4000, api on :4005);
    // Playwright handles credentials automatically so nothing extra here.
  },

  globalSetup: require.resolve('./src/fixtures/global-setup.ts'),

  // ── Projects ─────────────────────────────────────────────────
  // Convention: <browser>-<portal>[-<viewport>]
  // The matrix is 3 browsers × 4 portal-shells + 4 viewports + 1 a11y.
  // CI runs the whole matrix; local devs typically use --project=chromium-clinic.
  projects: [
    // Public + auth flows that don't need storageState.
    {
      name: 'chromium-public',
      testDir: './src/clinic',
      testMatch: ANON_SPECS,
      use: { ...devices['Desktop Chrome'] },
    },

    // Per-portal authed shells. Each picks up the appropriate storageState.
    {
      ...authed('chromium-clinic', CLINIC_ROLES, devices['Desktop Chrome']),
      testDir: './src/clinic',
      testIgnore: ANON_SPECS,
    },
    {
      ...authed('chromium-portal', ['patient'], devices['Desktop Chrome']),
      testDir: './src/portal',
    },
    {
      ...authed('chromium-lab', ['labOwner'], devices['Desktop Chrome']),
      testDir: './src/lab',
    },
    {
      ...authed(
        'chromium-platform',
        ['platformAdmin'],
        devices['Desktop Chrome'],
      ),
      testDir: './src/platform',
    },

    // Cross-browser repeat for clinic only — the highest-value surface.
    {
      ...authed('firefox-clinic', CLINIC_ROLES, devices['Desktop Firefox']),
      testDir: './src/clinic',
      testIgnore: ANON_SPECS,
    },
    {
      ...authed('webkit-clinic', CLINIC_ROLES, devices['Desktop Safari']),
      testDir: './src/clinic',
      testIgnore: ANON_SPECS,
    },

    // Responsive viewport sweeps. These specs read a viewport size from a
    // shared util and assert no horizontal overflow + nav is reachable.
    {
      ...authed('mobile-375', ['clinicOwner'], {
        ...devices['Pixel 5'], // 393×851
        viewport: { width: 375, height: 812 },
      }),
      testDir: './src/responsive',
    },
    {
      ...authed('tablet-768', ['clinicOwner'], {
        ...devices['iPad (gen 7)'],
        viewport: { width: 768, height: 1024 },
      }),
      testDir: './src/responsive',
    },
    {
      ...authed('desktop-1280', ['clinicOwner'], {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      }),
      testDir: './src/responsive',
    },
    {
      ...authed('wide-1920', ['clinicOwner'], {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      }),
      testDir: './src/responsive',
    },

    // a11y smoke — chromium only, top 5 pages.
    {
      ...authed('a11y', ['clinicOwner'], devices['Desktop Chrome']),
      testDir: './src/a11y',
    },
  ],

  // We deliberately don't autostart api/web from Playwright. Both
  // local dev and CI start them in their own terminals/steps so logs
  // are separated and a hung server doesn't block the spec runner. Run:
  //   pnpm nx serve @org/api   # terminal 1 (waits for Postgres)
  //   pnpm nx dev   @org/web   # terminal 2
  //   pnpm nx run @org/web-e2e:e2e   # terminal 3
});
