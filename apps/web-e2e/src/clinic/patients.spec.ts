import { test, expect } from '@playwright/test';

test.describe('@web clinic patients', () => {
  test('list page renders with search input', async ({ page }) => {
    await page.goto('/patients');
    await expect(page).toHaveURL(/\/patients/);
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('opens the create-patient dialog', async ({ page }) => {
    await page.goto('/patients');
    await page.getByRole('button', { name: /new patient|add patient|create/i }).first().click();
    // shadcn Dialog renders a role=dialog when open.
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
  });
});
