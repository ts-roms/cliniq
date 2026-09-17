import { test, expect } from '@playwright/test';

test.describe('@web clinic queue', () => {
  test('renders the queue page (cookie-driven, no localStorage tokens)', async ({
    page,
  }) => {
    await page.goto('/queue');
    await expect(page).toHaveURL(/\/queue/);
    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: 15_000,
    });
    // Regression check: the old code read tokens from localStorage. Confirm
    // the cookie-based migration didn't leave a `cliniq.session.accessToken`
    // string in localStorage.
    const sessionRaw = await page.evaluate(() =>
      window.localStorage.getItem('cliniq.session'),
    );
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      expect(
        parsed.accessToken,
        'accessToken must NOT live in localStorage',
      ).toBeUndefined();
      expect(
        parsed.refreshToken,
        'refreshToken must NOT live in localStorage',
      ).toBeUndefined();
    }
  });

  test('display variant loads at /queue/display', async ({ page }) => {
    await page.goto('/queue/display');
    await expect(page).toHaveURL(/\/queue\/display/);
    await expect(page.locator('body')).toBeVisible();
  });
});
