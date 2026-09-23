import { test as base } from '@playwright/test';

/**
 * One signed-in session per (project, role).
 *
 * Every project used to share a single `storage/<role>.json`, so the whole
 * matrix rode ONE session — and therefore one refresh token. Once the access
 * token expired, the first project to refresh rotated that token and the rest
 * were left presenting a rotated one, which the api treats as a replay and
 * answers 401. Whole projects then failed wholesale on the login page, and
 * which ones depended purely on execution order.
 *
 * Giving each project its own session row makes rotation independent: a
 * project refreshing its own token can no longer invalidate anybody else's,
 * so a failure stays inside the project that caused it.
 *
 * This is defence in depth, NOT a fix for token expiry, and it is worth being
 * precise about why. Playwright builds a fresh context per test, each one
 * re-reading this file from disk — so every test in a project starts from the
 * SAME refresh token. The first test to refresh rotates it server-side and
 * every later test in that project then presents a rotated one. Measured: with
 * `JWT_EXPIRES_IN=10s` to force mid-run refreshes, a project still failed
 * 24 of 30 cases with these per-project sessions in place.
 *
 * What actually keeps the suite deterministic is never refreshing during a
 * run — the `JWT_EXPIRES_IN` override in the CI web-e2e job. A real fix for
 * expiry would re-authenticate per test or per worker instead of replaying a
 * file, which is a much larger change to how the suite handles auth.
 */
export const ROLES = {
  clinicOwner: 'clinic-owner',
  clinicDoctor: 'clinic-doctor',
  clinicReceptionist: 'clinic-receptionist',
  patient: 'patient',
  labOwner: 'lab-owner',
  platformAdmin: 'platform-admin',
} as const;

export type SessionRole = keyof typeof ROLES;

/**
 * Where globalSetup writes, and where a project reads. Relative to the
 * Playwright config directory, which is how `storageState` resolves.
 */
export function sessionPath(project: string, role: SessionRole): string {
  return `storage/${project}/${ROLES[role]}.json`;
}

/**
 * A `test` bound to a role OTHER than its project's default.
 *
 * `test.use({ storageState: '…' })` needs a literal, which cannot know which
 * project is running — and with per-project sessions the path depends on it.
 * Overriding the fixture gives access to testInfo, so the right file is
 * picked at run time:
 *
 *   const asReceptionist = testAs('clinicReceptionist');
 *   asReceptionist.describe('…', () => { … });
 *
 * The role must be listed in that project's `metadata.roles` in
 * playwright.config.ts, or globalSetup will not have created the session.
 */
export function testAs(role: SessionRole) {
  return base.extend({
    // Playwright reads the destructuring to work out which fixtures this
    // override depends on; it needs none, only testInfo, hence the empty bag.
    // eslint-disable-next-line no-empty-pattern -- required by that contract
    storageState: async ({}, use, testInfo) => {
      await use(sessionPath(testInfo.project.name, role));
    },
  });
}
