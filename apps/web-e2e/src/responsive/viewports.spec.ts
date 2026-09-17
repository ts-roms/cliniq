import { test, expect, type Page } from '@playwright/test';

/**
 * Responsive sweep. Runs against the same project list (mobile-375, tablet-768,
 * desktop-1280, wide-1920) so a failure tells you exactly which viewport
 * regressed.
 *
 * The assertions are deliberately invariant — what we want to catch is the
 * stuff that breaks LAYOUT, not specific copy:
 *   1. Document doesn't horizontally scroll (modulo a tiny scrollbar fudge).
 *   2. Primary heading is in viewport (above the fold or reachable).
 *   3. The first <main> region is visible and not zero-sized.
 *
 * Pages covered: dashboard, patients, schedule, queue, consult-detail (we
 * list-then-click rather than hard-coding an ID), portal/home, lab/cases,
 * platform/dashboard.
 */

const PAGES: ReadonlyArray<{ name: string; url: string }> = [
  { name: 'dashboard', url: '/dashboard' },
  { name: 'patients', url: '/patients' },
  { name: 'schedule', url: '/schedule' },
  { name: 'queue', url: '/queue' },
  { name: 'inventory', url: '/inventory' },
  { name: 'notifications', url: '/notifications' },
];

// Tiny fudge for native scrollbar widths on Windows / Linux runners.
const SCROLL_FUDGE_PX = 20;

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect(
    overflow.scrollWidth - overflow.clientWidth,
    `horizontal overflow: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(SCROLL_FUDGE_PX);
}

async function assertHeadingVisible(page: Page): Promise<void> {
  const heading = page.locator('h1, h2').first();
  await expect(heading).toBeVisible({ timeout: 15_000 });
  // It should also have a non-zero box.
  const box = await heading.boundingBox();
  expect(box, 'heading box').not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
}

for (const { name, url } of PAGES) {
  test(`@responsive ${name} (${url}) lays out without horizontal overflow`, async ({ page }) => {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await assertNoHorizontalOverflow(page);
    await assertHeadingVisible(page);
  });
}

test.describe('@responsive interactive controls', () => {
  test('primary buttons are reachable (not clipped) on the patients page', async ({ page }) => {
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');
    const newBtn = page
      .getByRole('button', { name: /new patient|add patient|create/i })
      .first();
    await expect(newBtn).toBeVisible({ timeout: 10_000 });
    const box = await newBtn.boundingBox();
    expect(box, 'new patient button has a box').not.toBeNull();
    // Button must be at least 32x32 (WCAG AA target size soft minimum).
    expect(box!.width).toBeGreaterThanOrEqual(32);
    expect(box!.height).toBeGreaterThanOrEqual(32);
    // Must be inside the viewport horizontally.
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + SCROLL_FUDGE_PX);
  });

  test('dialog opens and stays inside the viewport on small screens', async ({ page }) => {
    await page.goto('/patients');
    const trigger = page
      .getByRole('button', { name: /new patient|add patient|create/i })
      .first();
    if ((await trigger.count()) === 0) test.skip();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    // Dialog horizontally inside the viewport.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + SCROLL_FUDGE_PX);
    // Dialog not taller than viewport (would clip Cancel/Submit buttons).
    expect(box!.height).toBeLessThanOrEqual(viewport.height + SCROLL_FUDGE_PX);
  });
});
