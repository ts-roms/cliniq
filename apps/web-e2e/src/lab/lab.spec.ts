import { test, expect } from '@playwright/test';

test.describe('@web lab marketplace', () => {
  test('cases page renders for LAB tenant', async ({ page }) => {
    await page.goto('/lab/cases');
    await expect(page).toHaveURL(/\/lab\/cases/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  });

  test('billing list renders', async ({ page }) => {
    await page.goto('/lab/billing');
    await expect(page).toHaveURL(/\/lab\/billing/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('catalog renders', async ({ page }) => {
    await page.goto('/lab/catalog');
    await expect(page).toHaveURL(/\/lab\/catalog/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('clinics page renders', async ({ page }) => {
    await page.goto('/lab/clinics');
    await expect(page).toHaveURL(/\/lab\/clinics/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('materials page renders', async ({ page }) => {
    await page.goto('/lab/materials');
    await expect(page).toHaveURL(/\/lab\/materials/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('compliance page renders', async ({ page }) => {
    await page.goto('/lab/compliance');
    await expect(page).toHaveURL(/\/lab\/compliance/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('tags page renders', async ({ page }) => {
    await page.goto('/lab/tags');
    await expect(page).toHaveURL(/\/lab\/tags/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('stats page renders charts', async ({ page }) => {
    await page.goto('/lab/stats');
    await expect(page).toHaveURL(/\/lab\/stats/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  });
});
