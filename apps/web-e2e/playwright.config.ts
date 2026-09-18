import { defineConfig, devices } from '@playwright/test';

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

const STORAGE = {
  clinicOwner: 'storage/clinic-owner.json',
  clinicDoctor: 'storage/clinic-doctor.json',
  clinicReceptionist: 'storage/clinic-receptionist.json',
  patient: 'storage/patient.json',
  labOwner: 'storage/lab-owner.json',
  platformAdmin: 'storage/platform-admin.json',
} as const;

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
      testMatch: /(login|signup)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },

    // Per-portal authed shells. Each picks up the appropriate storageState.
    {
      name: 'chromium-clinic',
      testDir: './src/clinic',
      testIgnore: /(login|signup)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], storageState: STORAGE.clinicOwner },
    },
    {
      name: 'chromium-portal',
      testDir: './src/portal',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE.patient },
    },
    {
      name: 'chromium-lab',
      testDir: './src/lab',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE.labOwner },
    },
    {
      name: 'chromium-platform',
      testDir: './src/platform',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE.platformAdmin,
      },
    },

    // Cross-browser repeat for clinic only — the highest-value surface.
    {
      name: 'firefox-clinic',
      testDir: './src/clinic',
      testIgnore: /(login|signup)\.spec\.ts$/,
      use: { ...devices['Desktop Firefox'], storageState: STORAGE.clinicOwner },
    },
    {
      name: 'webkit-clinic',
      testDir: './src/clinic',
      testIgnore: /(login|signup)\.spec\.ts$/,
      use: { ...devices['Desktop Safari'], storageState: STORAGE.clinicOwner },
    },

    // Responsive viewport sweeps. These specs read a viewport size from a
    // shared util and assert no horizontal overflow + nav is reachable.
    {
      name: 'mobile-375',
      testDir: './src/responsive',
      use: {
        ...devices['Pixel 5'], // 393×851
        viewport: { width: 375, height: 812 },
        storageState: STORAGE.clinicOwner,
      },
    },
    {
      name: 'tablet-768',
      testDir: './src/responsive',
      use: {
        ...devices['iPad (gen 7)'],
        viewport: { width: 768, height: 1024 },
        storageState: STORAGE.clinicOwner,
      },
    },
    {
      name: 'desktop-1280',
      testDir: './src/responsive',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: STORAGE.clinicOwner,
      },
    },
    {
      name: 'wide-1920',
      testDir: './src/responsive',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        storageState: STORAGE.clinicOwner,
      },
    },

    // a11y smoke — chromium only, top 5 pages.
    {
      name: 'a11y',
      testDir: './src/a11y',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE.clinicOwner },
    },
  ],

  // We deliberately don't autostart api/web from Playwright. Both
  // local dev and CI start them in their own terminals/steps so logs
  // are separated and a hung server doesn't block the spec runner. Run:
  //   pnpm nx serve @org/api   # terminal 1 (waits for Postgres)
  //   pnpm nx dev   @org/web   # terminal 2
  //   pnpm nx run @org/web-e2e:e2e   # terminal 3
});
