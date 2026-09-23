import { test, expect, type Page } from '@playwright/test';
import { loadSeed } from '../utils/seed';

/**
 * Clinical module configuration, end to end.
 *
 * The chart used to render every specialty card for every patient in every
 * clinic — a cardiology clinic got a dental chart, a male patient got an
 * ultrasound card. A clinic now picks what it practises, with one deliberate
 * exception: a module that is switched OFF but already holds records for this
 * patient keeps rendering, flagged, because hiding clinical history a patient
 * actually has is the failure mode worth designing against.
 *
 * Serial: these cases mutate tenant-wide settings, so they must not interleave
 * with each other. Settings are restored in afterAll.
 */
test.describe.configure({ mode: 'serial' });

const API = process.env.API_E2E_URL ?? 'http://localhost:4005';
const ALL = ['dental', 'ob', 'ultrasound', 'lab_orders', 'hmo'];

/** The storageState cookie is host-scoped, so page.request reaches the api. */
async function setModules(page: Page, modules: string[]) {
  const res = await page.request.patch(`${API}/api/tenants/me/settings`, {
    data: { modules },
  });
  expect(res.ok(), `set modules -> ${res.status()}`).toBe(true);
}

test.describe('@web clinical modules', () => {
  test.afterAll(async ({ browser }) => {
    // Leave the tenant as every other spec expects to find it.
    const ctx = await browser.newContext({
      storageState: 'storage/clinic-owner.json',
    });
    const page = await ctx.newPage();
    await setModules(page, ALL);
    await ctx.close();
  });

  test('settings exposes the clinical modules card', async ({ page }) => {
    await page.goto('/admin/settings');
    // Scoped to the card: the module labels come from one shared catalogue, so
    // the visit-types card on the same page renders the same strings and an
    // unscoped getByText is a strict-mode violation.
    const card = page.locator('[data-test="clinic-modules-card"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText('Dental charting')).toBeVisible();
    await expect(card.getByText('Obstetrics')).toBeVisible();
    // Every module in the catalogue gets a toggle.
    await expect(card.locator('input[type="checkbox"]')).toHaveCount(5);
  });

  test('an enabled module renders on the chart un-flagged', async ({
    page,
  }) => {
    const { clinic } = loadSeed();
    await setModules(page, ALL);
    await page.goto(`/patients/${clinic.patient.patientId}`);
    // The dental card's heading is "Odontogram" — assert the real text.
    await expect(page.getByText('Odontogram').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator('[data-test="out-of-scope-module-dental"]'),
    ).toHaveCount(0);
  });

  test('a disabled module with no records disappears from the chart', async ({
    page,
  }) => {
    const { clinic } = loadSeed();
    // The seeded patient has no obstetrics records, so OB should vanish.
    await setModules(page, ['dental', 'lab_orders', 'hmo']);
    await page.goto(`/patients/${clinic.patient.patientId}`);
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({
      timeout: 15_000,
    });
    // The OB card is gone entirely, banner and all.
    await expect(
      page.locator('[data-test="out-of-scope-module-ob"]'),
    ).toHaveCount(0);
    await expect(page.getByText('OB / Pregnancy')).toHaveCount(0);
    // ...while a module that is still enabled keeps rendering.
    await expect(page.getByText('Odontogram').first()).toBeVisible();
  });

  test('a disabled module that HOLDS records still renders, flagged', async ({
    page,
  }) => {
    const { clinic } = loadSeed();
    const patientId = clinic.patient.patientId;

    // Give the patient real dental history first.
    const chart = await page.request.post(
      `${API}/api/patients/${patientId}/dental-chart`,
      {
        data: {
          dentition: 'ADULT',
          teeth: [
            {
              toothCode: '11',
              status: 'PRESENT',
              surfaces: [{ surface: 'O', finding: 'CARIES' }],
            },
          ],
        },
      },
    );
    expect(chart.ok(), `write chart -> ${chart.status()}`).toBe(true);

    // Now switch dental off for the whole clinic.
    await setModules(page, ['lab_orders', 'hmo']);
    await page.goto(`/patients/${patientId}`);

    const flagged = page.locator('[data-test="out-of-scope-module-dental"]');
    await expect(flagged).toBeVisible({ timeout: 15_000 });
    await expect(flagged).toContainText(/not part of this clinic/i);

    // OB has no records for this patient, so it stays hidden — proving the
    // banner is driven by data and not simply by "module is off".
    await expect(
      page.locator('[data-test="out-of-scope-module-ob"]'),
    ).toHaveCount(0);
  });
});
