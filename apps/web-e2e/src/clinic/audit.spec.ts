import { test, expect } from '@playwright/test';

test.describe('@web clinic audit log', () => {
  test('renders the audit list (OWNER session)', async ({ page }) => {
    await page.goto('/audit');
    await expect(page).toHaveURL(/\/audit/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  });
});
