import { test, expect } from '@playwright/test';

test.describe('@web clinic notifications', () => {
  test('renders the inbox', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page).toHaveURL(/\/notifications/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  });
});
