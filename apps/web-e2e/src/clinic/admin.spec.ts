import { test, expect } from '@playwright/test';

test.describe('@web clinic admin', () => {
  test('settings page renders', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  });

  test('claims inbox renders', async ({ page }) => {
    await page.goto('/admin/claims');
    await expect(page).toHaveURL(/\/admin\/claims/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  });

  test('DSR inbox renders', async ({ page }) => {
    await page.goto('/admin/dsr');
    await expect(page).toHaveURL(/\/admin\/dsr/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  });
});
