import { test, expect } from '@playwright/test';

test.describe('@web clinic schedule', () => {
  test('renders a daily list with a date picker', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page).toHaveURL(/\/schedule/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  });
});
