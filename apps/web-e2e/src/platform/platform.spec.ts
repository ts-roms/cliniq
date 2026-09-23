import { test, expect } from '@playwright/test';

test.describe('@web platform admin', () => {
  test('dashboard (tenants table) renders', async ({ page }) => {
    await page.goto('/platform/dashboard');
    await expect(page).toHaveURL(/\/platform\/dashboard/);
    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('tenant detail page renders for the seeded clinic', async ({ page }) => {
    // The dashboard lists tenants; click into the first one for a detail
    // smoke check.
    //
    // This used to read `firstRow.count()` straight after `goto` and skip on
    // zero — but the table is filled by a TanStack Query that has not
    // resolved yet at that point, so the count was always 0 and the case
    // skipped itself on every run. Global setup provisions tenants before
    // any spec starts, so the row WILL arrive: wait for it instead.
    await page.goto('/platform/dashboard');
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });

    const link = firstRow.getByRole('link').first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();

    await expect(page).toHaveURL(/\/platform\/tenants\/.+/);
    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  // Sign-out used to clear localStorage and nothing else: the httpOnly
  // cookies stayed put and the refresh token stayed valid for its full TTL,
  // so "signed out" meant "nav hidden". Assert the session is actually gone
  // by going back to a guarded route — the proxy has to bounce it.
  //
  // Runs in its own context (Playwright re-reads storageState per test), so
  // revoking this session does not disturb the other platform specs.
  test('sign out ends the session, not just the local shell', async ({
    page,
  }) => {
    await page.goto('/platform/dashboard');
    await expect(page.locator('table tbody tr').first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/platform\/login/, { timeout: 15_000 });

    await page.goto('/platform/dashboard');
    await expect(page).toHaveURL(/\/platform\/login/, { timeout: 15_000 });
  });
});
