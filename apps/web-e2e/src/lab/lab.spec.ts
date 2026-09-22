import { test, expect } from '@playwright/test';

/**
 * Lab console shell smoke.
 *
 * Every case here used to assert `expect(page.locator('body')).toBeVisible()`,
 * which is true of literally any page — including the clinic /login form the
 * lab shell bounces to when the session gate misfires. The suite was green
 * while the lab console was showing a login screen. Assert something only the
 * lab shell renders instead: its "ClinIQ Lab" header, which sits inside the
 * authed layout and cannot appear on a login page.
 */
const LAB_PAGES = [
  ['cases', '/lab/cases'],
  ['billing', '/lab/billing'],
  ['catalog', '/lab/catalog'],
  ['clinics', '/lab/clinics'],
  ['materials', '/lab/materials'],
  ['compliance', '/lab/compliance'],
  ['tags', '/lab/tags'],
  ['stats', '/lab/stats'],
] as const;

test.describe('@web lab marketplace', () => {
  for (const [label, path] of LAB_PAGES) {
    test(`${label} page renders inside the lab shell`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//gu, '\\/')));
      // Proof we are in the authed lab console, not on a login screen.
      await expect(page.getByText('ClinIQ Lab').first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('h1, h2, h3').first()).toBeVisible({
        timeout: 15_000,
      });
    });
  }
});
