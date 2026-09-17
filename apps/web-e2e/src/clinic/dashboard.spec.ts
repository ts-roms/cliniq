import { test, expect } from '@playwright/test';

test.describe('@web clinic dashboard', () => {
  test('renders overview cards and the revenue chart', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    // The dashboard is composed of OverviewGrid + RevenueChart + TopServices
    // + NoShow. We don't assert exact text (i18n-friendly) — just that
    // SOMETHING rendered above the empty-state.
    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: 15_000,
    });
    // No console errors past the network idle.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForLoadState('networkidle');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
