import { test, expect } from '@playwright/test';

/**
 * Picking the product on the landing page instead of inside signup.
 *
 * ClinIQ sells to clinics and to dental labs — different tenant kinds, plans
 * and app shells. That choice used to be a toggle inside the signup card, so
 * a lab owner followed a generic "Start free trial" and then had to notice a
 * control telling them they were about to create the wrong kind of tenant.
 *
 * Anonymous: this project carries no storageState (see chromium-public).
 */
test.describe('@web signup choice', () => {
  test('the landing page offers both products', async ({ page }) => {
    await page.goto('/');
    const clinic = page.locator('[data-test="signup-clinic"]').first();
    const lab = page.locator('[data-test="signup-lab"]').first();

    await expect(clinic).toBeVisible({ timeout: 15_000 });
    await expect(lab).toBeVisible();
    await expect(clinic).toContainText(/sign up for clin/i);
    await expect(lab).toContainText(/sign up for dental lab/i);
    await expect(clinic).toHaveAttribute('href', '/signup?kind=clinic');
    await expect(lab).toHaveAttribute('href', '/signup?kind=lab');
  });

  test('the lab CTA lands on a lab signup with no kind toggle', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('[data-test="signup-lab"]').first().click();
    await expect(page).toHaveURL(/\/signup\?kind=lab/);

    // Wording follows the choice…
    await expect(page.getByText('Start your lab')).toBeVisible({
      timeout: 15_000,
    });
    // …and the choice is confirmed without being re-asked.
    await expect(page.locator('[data-test="signup-kind-label"]')).toHaveText(
      'Dental laboratory',
    );
    await expect(
      page.getByRole('button', { name: 'Lab', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Clinic', exact: true }),
    ).toHaveCount(0);
  });

  test('the clinic CTA lands on a clinic signup with no kind toggle', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('[data-test="signup-clinic"]').first().click();
    await expect(page).toHaveURL(/\/signup\?kind=clinic/);

    await expect(page.getByText('Start your clinic')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-test="signup-kind-label"]')).toHaveText(
      'Clinic',
    );
    await expect(
      page.getByRole('button', { name: 'Lab', exact: true }),
    ).toHaveCount(0);
  });

  test('reaching /signup directly still lets you choose', async ({ page }) => {
    // The header CTA and any old bookmark point here with no ?kind=, so the
    // toggle has to stay for that path — removing it would strand them.
    await page.goto('/signup');
    await expect(
      page.getByRole('button', { name: 'Clinic', exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: 'Lab', exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-test="signup-kind-label"]')).toHaveCount(
      0,
    );
  });
});
