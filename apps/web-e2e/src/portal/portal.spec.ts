import { test, expect } from '@playwright/test';

test.describe('@web patient portal', () => {
  test('home (/portal) renders cards for the patient', async ({ page }) => {
    await page.goto('/portal');
    await expect(page).not.toHaveURL(/\/portal\/login/);
    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('appointments page renders', async ({ page }) => {
    await page.goto('/portal/appointments');
    await expect(page).toHaveURL(/\/portal\/appointments/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('records page renders', async ({ page }) => {
    await page.goto('/portal/records');
    await expect(page).toHaveURL(/\/portal\/records/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('invoices page renders', async ({ page }) => {
    await page.goto('/portal/invoices');
    await expect(page).toHaveURL(/\/portal\/invoices/);
    await expect(page.locator('body')).toBeVisible();
  });
});
