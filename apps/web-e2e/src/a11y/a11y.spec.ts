import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loadSeed } from '../utils/seed';

/**
 * a11y smoke: top 5 pages, fail on `serious` or `critical`. We don't gate on
 * `minor` / `moderate` yet — the audit found that the web app has thin a11y
 * coverage today (only ~18 aria-* attrs across the clinic shell) and we'd
 * rather ship a meaningful smoke than a flaky audit.
 */
async function runAxe(page: import('@playwright/test').Page) {
  return new AxeBuilder({ page })
    // Skip rules that are known false-positives in our shadcn-based shell.
    .disableRules([
      // Our radix dialog uses a region landmark inside it; axe sometimes
      // double-counts. Re-enable once we audit landmarks holistically.
      'region',
    ])
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}

function summarize(violations: Awaited<ReturnType<typeof runAxe>>['violations']): string {
  return violations
    .map(
      (v) =>
        `${v.impact}: ${v.id} — ${v.description}\n  nodes: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(', ')}`,
    )
    .join('\n\n');
}

const FAIL_ON: ReadonlyArray<'critical' | 'serious'> = ['critical', 'serious'];

const TOP_PAGES = [
  { name: 'login', url: '/login', authed: false },
  { name: 'dashboard', url: '/dashboard', authed: true },
  { name: 'patients', url: '/patients', authed: true },
  { name: 'queue', url: '/queue', authed: true },
];

for (const p of TOP_PAGES) {
  test(`@a11y ${p.name} (${p.url}) has no critical/serious violations`, async ({ page }) => {
    await page.goto(p.url);
    await page.waitForLoadState('networkidle');
    const result = await runAxe(page);
    const blocking = result.violations.filter((v) =>
      FAIL_ON.includes(v.impact as 'critical' | 'serious'),
    );
    expect(
      blocking,
      blocking.length > 0
        ? `\n${summarize(blocking)}`
        : 'no critical/serious a11y violations',
    ).toEqual([]);
  });
}

test('@a11y patient detail (sample row) has no critical/serious violations', async ({ page }) => {
  await page.goto('/patients');
  await page.waitForLoadState('networkidle');
  const link = page.locator('table a, [data-test="patient-row"] a').first();
  if ((await link.count()) === 0) {
    test.skip(true, 'no patients in seed; skipping detail-page a11y smoke');
    return;
  }
  await link.click();
  await page.waitForLoadState('networkidle');
  const result = await runAxe(page);
  const blocking = result.violations.filter((v) =>
    FAIL_ON.includes(v.impact as 'critical' | 'serious'),
  );
  expect(blocking, blocking.length > 0 ? `\n${summarize(blocking)}` : 'clean').toEqual([]);
  void loadSeed; // ensure import isn't tree-shaken; future seed-aware specs can use it
});
