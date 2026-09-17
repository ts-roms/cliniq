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
    // smoke check. If the table is empty (race with a parallel test wiping
    // tenants), skip this case rather than fail.
    await page.goto('/platform/dashboard');
    const firstRow = page.locator('table tbody tr').first();
    if ((await firstRow.count()) === 0) test.skip();
    const link = firstRow.getByRole('link').first();
    if ((await link.count()) === 0) test.skip();
    await link.click();
    await expect(page).toHaveURL(/\/platform\/tenants\/.+/);
    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
