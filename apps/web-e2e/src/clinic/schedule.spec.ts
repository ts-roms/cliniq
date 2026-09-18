import { test, expect } from '@playwright/test';

test.describe('@web clinic schedule', () => {
  test('renders a daily list with a date picker', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page).toHaveURL(/\/schedule/);
    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole('button', { name: 'Schedule date' }),
    ).toBeVisible();
  });

  test('picks a day from the shadcn calendar popover', async ({ page }) => {
    await page.goto('/schedule');
    const trigger = page.getByRole('button', { name: 'Schedule date' });
    await expect(trigger).toBeVisible({ timeout: 15_000 });

    // Open the popover and pick the 15th of the shown month via the grid.
    await trigger.click();
    const grid = page.getByRole('grid');
    await expect(grid).toBeVisible();
    await grid.getByRole('button', { name: /15/ }).first().click();

    // Popover closes on select and the header reflects the pick.
    await expect(grid).toBeHidden();
    await expect(trigger).toHaveText(/15/);
    await expect(page.locator('h1 + p')).toContainText(/15/);
  });

  test('keyboard: arrow keys move focus, Enter selects', async ({ page }) => {
    await page.goto('/schedule');
    const trigger = page.getByRole('button', { name: 'Schedule date' });
    await expect(trigger).toBeVisible({ timeout: 15_000 });

    await trigger.focus();
    await page.keyboard.press('Enter');
    const grid = page.getByRole('grid');
    await expect(grid).toBeVisible();

    // react-day-picker focuses the selected day; move one day forward.
    const selected = grid.locator('[aria-selected="true"] button');
    await expect(selected).toBeFocused();
    const dayOf = (label: string | null) =>
      Number(/ (\d{1,2}), \d{4}$/.exec(label ?? '')?.[1]);
    const before = dayOf(await trigger.textContent());
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    await expect(grid).toBeHidden();
    const after = dayOf(await trigger.textContent());
    // +1 day, or 1 when the arrow crossed into the next month.
    expect([before + 1, 1]).toContain(after);
  });

  test('prev / next / today step the day', async ({ page }) => {
    await page.goto('/schedule');
    const trigger = page.getByRole('button', { name: 'Schedule date' });
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    const start = await trigger.textContent();

    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(trigger).not.toHaveText(start ?? '');
    await page.getByRole('button', { name: 'Previous day' }).click();
    await expect(trigger).toHaveText(start ?? '');
    await page.getByRole('button', { name: 'Previous day' }).click();
    await page.getByRole('button', { name: 'Today' }).click();
    await expect(trigger).toHaveText(start ?? '');
  });

  test('new-appointment dialog: calendar date + time fields', async ({
    page,
  }) => {
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'New appointment' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Date defaults to the schedule's day; pick the 20th from the calendar.
    const date = dialog.getByLabel('Date');
    await expect(date).toHaveText(/\d{4}/);
    await date.click();
    const grid = page.getByRole('grid');
    await expect(grid).toBeVisible();
    await grid.getByRole('button', { name: / 20th, / }).click();
    await expect(grid).toBeHidden();
    await expect(date).toHaveText(/ 20, /);

    // Ends before Starts is refused client-side.
    await dialog.getByLabel('Starts').fill('09:00');
    await dialog.getByLabel('Ends').fill('08:30');
    await dialog.getByRole('button', { name: 'Schedule' }).click();
    await expect(dialog.getByText('must be after start')).toBeVisible();
  });
});
