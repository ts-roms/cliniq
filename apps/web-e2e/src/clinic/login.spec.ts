import { test, expect } from '@playwright/test';
import { loadSeed } from '../utils/seed';

test.describe('@web /login', () => {
  test('renders the login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('rejects bad credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('nobody@e2e.local');
    await page.getByLabel(/password/i).fill('not-the-real-password');
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    // We never want to land in the authed shell on bad creds.
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    // The form should surface an error somewhere — be lenient about phrasing.
    const errorish = page.locator(
      'text=/invalid|incorrect|wrong|denied|failed/i',
    );
    await expect(errorish.first()).toBeVisible({ timeout: 10_000 });
  });

  test('signs in and lands in the authed shell', async ({ page }) => {
    const seed = loadSeed();
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(seed.clinic.owner.email);
    await page.getByLabel(/password/i).fill(seed.clinic.owner.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  });
});

test.describe('@web auth gating (cookie-based middleware)', () => {
  test('anonymous → /dashboard redirects to /login with ?next', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?.*next=/);
  });

  test('anonymous → /patients redirects to /login', async ({ page }) => {
    await page.goto('/patients');
    await expect(page).toHaveURL(/\/login/);
  });

  test('anonymous → /portal/appointments redirects to /portal/login', async ({ page }) => {
    await page.goto('/portal/appointments');
    await expect(page).toHaveURL(/\/portal\/login/);
  });

  test('anonymous → /platform/dashboard redirects to /platform/login', async ({ page }) => {
    await page.goto('/platform/dashboard');
    await expect(page).toHaveURL(/\/platform\/login/);
  });
});
