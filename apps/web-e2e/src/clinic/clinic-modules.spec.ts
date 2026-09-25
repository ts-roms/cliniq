import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { loadSeed } from '../utils/seed';
import { sessionPath } from '../fixtures/sessions';

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

/** Opens the header's "Add service" menu and returns its popover. */
async function openServicesMenu(page: Page) {
  await page
    .locator('[data-test="add-service-button"]')
    .click({ timeout: 15_000 });
  const menu = page.locator('[data-test="patient-services-menu"]');
  await expect(menu).toBeVisible();
  return menu;
}

/**
 * A patient of our own with no specialty records. The seeded patient is shared
 * by every Playwright project, and the flagged-module case below gives it a
 * dental chart, so it cannot stand in for "empty" across the matrix.
 */
async function createPatient(
  page: Page,
  body: { sex: string; dateOfBirth: string },
): Promise<string> {
  const rand = randomUUID().slice(0, 8);
  const res = await page.request.post(`${API}/api/patients`, {
    data: {
      mrn: `E2E-MOD-${rand}`.toUpperCase(),
      firstName: 'Module',
      lastName: `Probe ${rand}`,
      ...body,
    },
  });
  expect(res.status(), `create patient -> ${res.status()}`).toBe(201);
  return (await res.json()).id as string;
}

test.describe('@web clinical modules', () => {
  test.afterAll(async ({ browser }, testInfo) => {
    // Leave the tenant as every other spec expects to find it. Sessions are
    // per (project, role), so take this project's own rather than a literal.
    const ctx = await browser.newContext({
      storageState: sessionPath(testInfo.project.name, 'clinicOwner'),
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

  test('an enabled but empty specialty is offered, and opens un-flagged', async ({
    page,
  }) => {
    await setModules(page, ALL);
    const patientId = await createPatient(page, {
      sex: 'FEMALE',
      dateOfBirth: '1995-06-15',
    });
    await page.goto(`/patients/${patientId}`);

    // A GENERAL clinic does not open an empty odontogram for every walk-in:
    // it waits in the header's Add-service menu instead.
    // Lab orders are routine everywhere, so they open by default.
    await expect(page.locator('[data-test="module-lab_orders"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-test="module-dental"]')).toHaveCount(0);

    const menu = await openServicesMenu(page);
    await menu.locator('[data-test="offer-module-dental"]').click();
    // Choosing an entry closes the menu.
    await expect(menu).toBeHidden();
    await expect(page.locator('[data-test="module-dental"]')).toBeVisible();
    await expect(page.getByText('Odontogram').first()).toBeVisible();
    await expect(
      page.locator('[data-test="out-of-scope-module-dental"]'),
    ).toHaveCount(0);
    // Opened, so no longer offered.
    const again = await openServicesMenu(page);
    await expect(
      again.locator('[data-test="offer-module-dental"]'),
    ).toHaveCount(0);
  });

  test('OB is never offered to a male patient, and the chart says why', async ({
    page,
  }) => {
    await setModules(page, ALL);
    const patientId = await createPatient(page, {
      sex: 'MALE',
      dateOfBirth: '1986-01-15',
    });
    await page.goto(`/patients/${patientId}`);

    const bar = await openServicesMenu(page);
    await expect(bar.locator('[data-test="offer-module-ob"]')).toHaveCount(0);
    await expect(page.locator('[data-test="module-ob"]')).toHaveCount(0);
    await expect(
      bar.locator('[data-test="not-applicable-modules"]'),
    ).toContainText('Obstetrics');
    // Everything else the clinic offers is still one click away.
    await expect(
      bar.locator('[data-test="offer-module-dental"]'),
    ).toBeVisible();
  });

  test('a visit-focus link opens a module that was folded away', async ({
    page,
  }) => {
    await setModules(page, ALL);
    const patientId = await createPatient(page, {
      sex: 'MALE',
      dateOfBirth: '1986-01-15',
    });
    // Same href the consult's Visit focus panel renders.
    await page.goto(`/patients/${patientId}#module-dental`);
    await expect(page.locator('[data-test="module-dental"]')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('a disabled module with no records disappears from the chart', async ({
    page,
  }) => {
    const { clinic } = loadSeed();
    // The seeded patient has no obstetrics records, so OB should vanish.
    await setModules(page, ['dental', 'lab_orders', 'hmo']);
    await page.goto(`/patients/${clinic.patient.patientId}`);
    await expect(page.locator('[data-test="module-lab_orders"]')).toBeVisible({
      timeout: 15_000,
    });
    // The OB card is gone entirely — not rendered, flagged, or offered.
    await expect(
      page.locator('[data-test="out-of-scope-module-ob"]'),
    ).toHaveCount(0);
    await expect(page.locator('[data-test="module-ob"]')).toHaveCount(0);
    // ...while a module that is still enabled stays reachable: rendered if
    // another project already charted this shared patient, offered if not.
    // HMO is enabled and uncharted here, so the menu always has an entry.
    const menu = await openServicesMenu(page);
    await expect(menu.locator('[data-test="offer-module-ob"]')).toHaveCount(0);
    if ((await page.locator('[data-test="module-dental"]').count()) === 0) {
      await expect(
        menu.locator('[data-test="offer-module-dental"]'),
      ).toBeVisible();
    }
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
