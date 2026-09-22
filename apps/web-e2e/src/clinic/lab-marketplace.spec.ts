import { test, expect } from '@playwright/test';
import { loadSeed } from '../utils/seed';

/**
 * Clinic side of the dental-lab marketplace — the product's headline
 * differentiator, and until now the only major shell with no browser
 * coverage at all.
 *
 * globalSetup seeds an accepted lab link, one DELIVERED case and one ISSUED
 * invoice (see fixtures/provision.ts `provisionMarketplace`), so these pages
 * are asserted with real rows in them rather than as empty shells.
 */
test.describe('@web clinic lab marketplace', () => {
  test('lab invitations page renders the accepted link', async ({ page }) => {
    await page.goto('/lab-invitations');
    await expect(page).toHaveURL(/\/lab-invitations/);
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({
      timeout: 15_000,
    });
    // The seeded link was accepted, so the lab's slug shows up on the page.
    const { lab } = loadSeed();
    await expect(
      page.getByText(lab.slug, { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('lab cases list shows the seeded case', async ({ page }) => {
    await page.goto('/lab-cases');
    await expect(page).toHaveURL(/\/lab-cases/);
    await expect(
      page.getByText('Maria Cruz', { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('lab case detail opens from the list', async ({ page }) => {
    const { marketplace } = loadSeed();
    await page.goto(`/lab-cases/${marketplace.caseId}`);
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({
      timeout: 15_000,
    });
    // DELIVERED is the terminal status the seed walks the case to.
    await expect(page.getByText(/delivered/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('new lab case page renders its form', async ({ page }) => {
    await page.goto('/lab-cases/new');
    await expect(page).toHaveURL(/\/lab-cases\/new/);
    await expect(page.locator('form, [role="form"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('lab invoices list shows the issued invoice', async ({ page }) => {
    // DRAFT invoices are hidden from the clinic; the seeded one is ISSUED.
    await page.goto('/lab-invoices');
    await expect(page).toHaveURL(/\/lab-invoices/);
    await expect(page.locator('table tbody tr').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('lab invoice detail opens', async ({ page }) => {
    const { marketplace } = loadSeed();
    await page.goto(`/lab-invoices/${marketplace.invoiceId}`);
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('no page in the shell surfaces a client error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('response', (res) => {
      if (res.status() >= 500) errors.push(`${res.status()} ${res.url()}`);
    });
    for (const path of ['/lab-invitations', '/lab-cases', '/lab-invoices']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
