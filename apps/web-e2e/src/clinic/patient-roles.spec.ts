import { test, expect, type Page } from '@playwright/test';
import { loadSeed } from '../utils/seed';

/**
 * The patient page renders only what the signed-in role may read, and only
 * the actions it may perform — the api's @Requires matrix mirrored through
 * useCan(). Before this, a RECEPTIONIST saw a Consultations card that could
 * never load (403 consult:read) and a "Start consultation" button that 403'd.
 */

/** Collect 403s from the api while the page settles. */
function watchForbidden(page: Page): string[] {
  const forbidden: string[] = [];
  page.on('response', (res) => {
    if (res.status() === 403 && res.url().includes('/api/')) {
      forbidden.push(
        `${res.request().method()} ${new URL(res.url()).pathname}`,
      );
    }
  });
  return forbidden;
}

test.describe('@web patient page — owner', () => {
  test('sees consultations, invoices and every action', async ({ page }) => {
    const { clinic } = loadSeed();
    const forbidden = watchForbidden(page);
    await page.goto(`/patients/${clinic.patient.patientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText('Consultations', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Invoices', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Start consultation' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /new prescription/i }),
    ).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(forbidden).toEqual([]);
  });
});

test.describe('@web patient page — receptionist', () => {
  test.use({ storageState: 'storage/clinic-receptionist.json' });

  test('gets no forbidden sections and no 403s', async ({ page }) => {
    const { clinic } = loadSeed();
    const forbidden = watchForbidden(page);
    await page.goto(`/patients/${clinic.patient.patientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    // Still a patient record the front desk can work with…
    await expect(page.getByText('Contact', { exact: true })).toBeVisible();
    await expect(page.getByText('Invoices', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /new invoice/i }),
    ).toBeVisible();
    // …minus the clinical parts the role has no read/write on.
    await expect(page.getByText('Consultations', { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: 'Start consultation' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /new prescription/i }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /order labs/i })).toHaveCount(
      0,
    );
    await page.waitForLoadState('networkidle');
    expect(forbidden).toEqual([]);
  });
});
