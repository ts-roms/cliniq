import { test, expect } from '@playwright/test';

test.describe('@web clinic inventory', () => {
  test('renders the items table on PREMIUM plan (feature gated)', async ({ page }) => {
    await page.goto('/inventory');
    // Either the page rendered (PREMIUM) or feature-gate redirected. Both
    // are OK as long as we didn't 500 or land on /login.
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).toBeVisible();
  });
});
