import { test, expect } from '@playwright/test';
import { loadSeed } from '../utils/seed';

/**
 * Visit types in the signed-in UI.
 *
 * A visit type says what the patient is coming in FOR, as opposed to
 * AppointmentType (the modality) — so this covers the three places a
 * clinician actually meets the concept: managing the catalogue, choosing one
 * when booking, and seeing what the consult is for.
 *
 * Both the booking field and the focus panel render nothing when a clinic has
 * no catalogue, which is deliberate — globalSetup provisions two entries so
 * these assert presence rather than absence.
 */
test.describe('@web visit types', () => {
  test('settings lists the clinic catalogue', async ({ page }) => {
    const { visitTypes } = loadSeed();
    await page.goto('/admin/settings');

    const list = page.locator('[data-test="visit-type-list"]');
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(list).toContainText(visitTypes.generalName);
    await expect(list).toContainText(visitTypes.dentalName);
    // The default is marked, and the modules a type focuses are shown.
    await expect(list).toContainText(/default/i);
    await expect(list).toContainText('Dental charting');
  });

  test('booking offers the visit type, defaulted to the clinic default', async ({
    page,
  }) => {
    const { visitTypes } = loadSeed();
    await page.goto('/schedule');

    await page
      .getByRole('button', { name: /new appointment|book|add appointment/i })
      .first()
      .click();

    const select = page.locator('[data-test="visit-type-select"]');
    await expect(select).toBeVisible({ timeout: 15_000 });
    // Pre-selected to the clinic's default rather than blank.
    await expect(select).toHaveValue(visitTypes.generalId);
    // Every catalogue entry is offered, plus the "General visit" escape.
    await expect(select.locator('option')).toHaveCount(3);

    await select.selectOption(visitTypes.dentalId);
    await expect(select).toHaveValue(visitTypes.dentalId);
    // Selecting one surfaces its description.
    await expect(page.getByText('Routine scale and polish')).toBeVisible();
  });

  test('the consult shows what the visit is for', async ({ page }) => {
    const { clinic, visitTypes } = loadSeed();
    const api = process.env.API_E2E_URL ?? 'http://localhost:4005';

    // Open a walk-in consult carrying the dental visit type, the same way
    // the app does — the UI has no walk-in-with-visit-type entry point yet.
    const res = await page.request.post(`${api}/api/consultations`, {
      data: {
        patientId: clinic.patient.patientId,
        visitTypeId: visitTypes.dentalId,
      },
    });
    expect(res.ok(), `start consult -> ${res.status()}`).toBe(true);
    const consult = await res.json();

    await page.goto(`/consultations/${consult.id}`);

    const panel = page.locator('[data-test="visit-focus-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.locator('[data-test="visit-focus-name"]')).toHaveText(
      visitTypes.dentalName,
    );
    // It names the records this visit needs and links to them on the chart.
    await expect(panel).toContainText('Dental charting');
    await expect(
      panel.getByRole('link', { name: 'Dental charting' }),
    ).toHaveAttribute(
      'href',
      `/patients/${clinic.patient.patientId}#module-dental`,
    );
  });

  test('a consult with no visit type shows no focus panel', async ({
    page,
  }) => {
    const { clinic } = loadSeed();
    const api = process.env.API_E2E_URL ?? 'http://localhost:4005';

    const res = await page.request.post(`${api}/api/consultations`, {
      data: { patientId: clinic.patient.patientId },
    });
    expect(res.ok(), `start consult -> ${res.status()}`).toBe(true);
    const consult = await res.json();

    await page.goto(`/consultations/${consult.id}`);
    // The SOAP editor proves the page rendered, so the absent panel below is
    // a real absence rather than a page that never loaded.
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-test="visit-focus-panel"]')).toHaveCount(
      0,
    );
  });
});
