import { test, expect } from '@playwright/test';
import { loadSeed } from '../utils/seed';

/**
 * Lab side of the marketplace, detail routes. `lab.spec.ts` covers the list
 * shells; these are the `[id]` pages, which are where the case workflow and
 * the invoice actually live and which nothing exercised before.
 *
 * The seeded case is DELIVERED and its invoice ISSUED — see
 * fixtures/provision.ts `provisionMarketplace`.
 */
/**
 * The clinic /login page the lab shell bounces to also has an <h3>, so a
 * heading assertion alone passes on a failed session gate. Every case proves
 * it is inside the authed lab console first.
 */
async function expectLabShell(page: import('@playwright/test').Page) {
  await expect(page.getByText('ClinIQ Lab').first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('@web lab case + billing detail', () => {
  test('case detail renders the seeded case', async ({ page }) => {
    const { marketplace } = loadSeed();
    await page.goto(`/lab/cases/${marketplace.caseId}`);
    await expectLabShell(page);
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText('Maria Cruz', { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('case list links through to the detail page', async ({ page }) => {
    await page.goto('/lab/cases');
    await expectLabShell(page);
    const row = page.locator('table tbody tr').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const link = row.getByRole('link').first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();
    await expect(page).toHaveURL(/\/lab\/cases\/.+/);
    await expectLabShell(page);
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('billing detail renders the issued invoice', async ({ page }) => {
    const { marketplace } = loadSeed();
    await page.goto(`/lab/billing/${marketplace.invoiceId}`);
    await expectLabShell(page);
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({
      timeout: 15_000,
    });
    // ₱3,500.00 seeded total — assert the money rendered, in any format.
    await expect(page.getByText(/3,?500/).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('catalog shows the seeded product', async ({ page }) => {
    await page.goto('/lab/catalog');
    await expectLabShell(page);
    await expect(
      page.getByText('PFM crown', { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('clinics page shows the linked clinic', async ({ page }) => {
    const { clinic } = loadSeed();
    await page.goto('/lab/clinics');
    await expectLabShell(page);
    await expect(
      page.getByText(clinic.slug, { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('no lab detail page surfaces a client error', async ({ page }) => {
    const { marketplace } = loadSeed();
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('response', (res) => {
      if (res.status() >= 500) errors.push(`${res.status()} ${res.url()}`);
    });
    for (const path of [
      `/lab/cases/${marketplace.caseId}`,
      `/lab/billing/${marketplace.invoiceId}`,
      '/lab/catalog',
      '/lab/clinics',
    ]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
