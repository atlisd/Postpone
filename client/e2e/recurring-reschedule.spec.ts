import { test, expect } from './fixtures';

test.describe.configure({ mode: 'serial' });

const TS = Date.now();
const PROJECT_NAME = `Reschedule Test ${TS}`;
const TASK_TITLE = `Period Tracker ${TS}`;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Switch the calendar to Month view if not already there, and wait for it to render. */
async function switchToMonthView(page: import('@playwright/test').Page) {
  // Wait for calendar UI to be present
  const viewPickerBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
  await expect(viewPickerBtn).toBeVisible({ timeout: 5000 });
  const current = await viewPickerBtn.textContent();
  if (!current?.toLowerCase().includes('month')) {
    await viewPickerBtn.click();
    await page.getByRole('button', { name: 'Month', exact: true }).last().click();
  }
  // Wait for the month grid (today's blue circle) to be visible
  await expect(page.locator('.bg-blue-600.rounded-full').first()).toBeVisible({ timeout: 5000 });
}

/**
 * Find a calendar day cell for the given day number.
 * isToday=true finds the cell containing the blue circle (today's indicator).
 * isToday=false finds a non-today cell.
 */
async function findDayCell(page: import('@playwright/test').Page, dayNum: number, isToday: boolean) {
  const allCells = page.locator('div[class*="cursor-pointer"][class*="min-h"]');
  const count = await allCells.count();

  for (let i = 0; i < count; i++) {
    const cell = allCells.nth(i);
    const dayCircleCount = await cell.locator('.bg-blue-600.rounded-full').count();
    const hasBlue = dayCircleCount > 0;
    if (hasBlue !== isToday) continue;

    // Check the day-number text — it's in the first child div of the cell
    const dayLabel = isToday
      ? cell.locator('.bg-blue-600.rounded-full').first()
      : cell.locator('div').first();
    const text = await dayLabel.textContent();
    if (text?.trim() === String(dayNum)) return cell;
  }
  return null;
}

/** Perform a mouse drag from source to target. */
async function drag(page: import('@playwright/test').Page, source: import('@playwright/test').Locator, target: import('@playwright/test').Locator) {
  const srcBB = await source.boundingBox();
  const tgtBB = await target.boundingBox();
  if (!srcBB || !tgtBB) throw new Error('Missing bounding boxes for drag');

  await page.mouse.move(srcBB.x + srcBB.width / 2, srcBB.y + srcBB.height / 2);
  await page.mouse.down();
  await page.mouse.move(srcBB.x + srcBB.width / 2, srcBB.y + srcBB.height / 2 + 5);
  await page.mouse.move(tgtBB.x + tgtBB.width / 2, tgtBB.y + tgtBB.height / 2, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(600);
}

let projectUrl = '';

test.describe('Recurring task reschedule modal', () => {
  test.beforeAll(async ({ browser }) => {
    // Create project + recurring task via UI (serial, runs once)
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await pg.goto('/login');
    await pg.getByLabel('Email').fill(process.env.TEST_EMAIL ?? 'admin@example.com');
    await pg.getByLabel('Password').fill(process.env.TEST_PASSWORD ?? 'admin123');
    await pg.getByRole('button', { name: /sign in/i }).click();
    await expect(pg).toHaveURL(/\/app/, { timeout: 10000 });

    // Create project
    const sidebar = pg.locator('aside');
    await sidebar.getByTitle('New project').click();
    await pg.getByPlaceholder('Project name').fill(PROJECT_NAME);
    await pg.getByRole('button', { name: 'Create' }).click();
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    projectUrl = pg.url();

    // Create task
    const input = pg.getByPlaceholder('Add a task...');
    await input.fill(TASK_TITLE);
    await input.press('Enter');
    await expect(pg.getByText(TASK_TITLE)).toBeVisible({ timeout: 5000 });

    // Open detail panel
    const taskRow = pg.locator('.group', { hasText: TASK_TITLE }).first();
    await taskRow.locator('span, p').filter({ hasText: TASK_TITLE }).first().click();
    await expect(pg.getByPlaceholder('Task title')).toBeVisible({ timeout: 5000 });

    // Set today as due date
    await pg.getByRole('button', { name: 'Pick date' }).click();
    const calPopup = pg.locator('.absolute.top-full');
    await expect(calPopup).toBeVisible({ timeout: 3000 });
    const todayNum = String(new Date().getDate());
    await calPopup.locator('button').filter({ hasText: new RegExp(`^${todayNum}$`) }).first().click();
    await pg.waitForTimeout(300);

    // Set weekly recurrence (every 7 days)
    const repeatBtn = pg.locator('button', { hasText: 'Repeat' });
    await repeatBtn.click();
    await pg.getByRole('button', { name: 'Every week', exact: true }).click();
    await pg.waitForTimeout(500);

    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await pg.goto('/login');
    await pg.getByLabel('Email').fill(process.env.TEST_EMAIL ?? 'admin@example.com');
    await pg.getByLabel('Password').fill(process.env.TEST_PASSWORD ?? 'admin123');
    await pg.getByRole('button', { name: /sign in/i }).click();
    await expect(pg).toHaveURL(/\/app/, { timeout: 10000 });

    const sidebar = pg.locator('aside');
    pg.on('dialog', dialog => dialog.accept());
    const entry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: PROJECT_NAME }).locator('..');
    if (await entry.count() > 0) {
      await entry.hover();
      await entry.locator('button').last().click();
      await pg.getByRole('button', { name: 'Delete' }).click();
      await expect(pg).toHaveURL(/\/app\/today/, { timeout: 10000 });
    }
    await ctx.close();
  });

  test('dragging a recurring occurrence shows the reschedule modal', async ({ page }) => {
    await page.goto('/app/calendar');
    await switchToMonthView(page);

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (tomorrow.getMonth() !== today.getMonth()) {
      test.skip();
      return;
    }

    const todayCell = await findDayCell(page, today.getDate(), true);
    if (!todayCell) { test.skip(); return; }
    const chip = todayCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE }).first();
    await chip.scrollIntoViewIfNeeded();
    await expect(chip).toBeVisible({ timeout: 5000 });

    const tomorrowCell = await findDayCell(page, tomorrow.getDate(), false);
    if (!tomorrowCell) { test.skip(); return; }

    await drag(page, chip, tomorrowCell);

    // Modal should appear
    await expect(page.getByText('Move Recurring Task')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Only this' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'This and following' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

    // Clean up by cancelling
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Move Recurring Task')).not.toBeVisible();
  });

  test('cancel leaves the occurrence on its original date', async ({ page }) => {
    await page.goto('/app/calendar');
    await switchToMonthView(page);

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (tomorrow.getMonth() !== today.getMonth()) {
      test.skip();
      return;
    }

    const todayCell = await findDayCell(page, today.getDate(), true);
    if (!todayCell) { test.skip(); return; }
    const chip = todayCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE }).first();
    await expect(chip).toBeVisible({ timeout: 5000 });

    const tomorrowCell = await findDayCell(page, tomorrow.getDate(), false);
    if (!tomorrowCell) { test.skip(); return; }

    await drag(page, chip, tomorrowCell);
    await expect(page.getByText('Move Recurring Task')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(400);

    // Today's cell should still have the chip
    await expect(todayCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE })).toBeVisible({ timeout: 5000 });
  });

  test('"Only this" moves just the dragged occurrence, next cycle stays on original date', async ({ page }) => {
    await page.goto('/app/calendar');
    await switchToMonthView(page);

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextCycle = new Date(today);
    nextCycle.setDate(nextCycle.getDate() + 7);

    if (tomorrow.getMonth() !== today.getMonth()) {
      test.skip();
      return;
    }

    const todayCell = await findDayCell(page, today.getDate(), true);
    if (!todayCell) { test.skip(); return; }
    const chip = todayCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE }).first();
    await expect(chip).toBeVisible({ timeout: 5000 });

    const tomorrowCell = await findDayCell(page, tomorrow.getDate(), false);
    if (!tomorrowCell) { test.skip(); return; }

    await drag(page, chip, tomorrowCell);
    await expect(page.getByText('Move Recurring Task')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Only this' }).click();
    await page.waitForTimeout(800);

    // Today's cell should be empty for this task
    await expect(todayCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE })).not.toBeVisible();

    // Tomorrow's cell should have the chip
    await expect(tomorrowCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE })).toBeVisible({ timeout: 5000 });

    // If next cycle is still in this month, it should still be on the original +7 date (unaffected)
    if (nextCycle.getMonth() === today.getMonth()) {
      const nextCycleCell = await findDayCell(page, nextCycle.getDate(), false);
      if (nextCycleCell) {
        await expect(nextCycleCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE })).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('"This and following" moves the occurrence and shifts all following', async ({ page }) => {
    await page.goto('/app/calendar');
    await switchToMonthView(page);

    // After "Only this" in the previous test, tomorrow now has today's occurrence.
    // We now want to drag tomorrow's occurrence to day-after-tomorrow and choose "this and following".
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    // The +7 cycle was originally at today+7; after split it should be at dayAfterTomorrow+7 = today+9
    const originalNextCycle = new Date(today);
    originalNextCycle.setDate(originalNextCycle.getDate() + 7);
    const newNextCycle = new Date(today);
    newNextCycle.setDate(newNextCycle.getDate() + 9);

    if (
      dayAfterTomorrow.getMonth() !== today.getMonth() ||
      newNextCycle.getMonth() !== today.getMonth()
    ) {
      test.skip();
      return;
    }

    // Find tomorrow's chip (rescheduled in prior test)
    const tomorrowCell = await findDayCell(page, tomorrow.getDate(), false);
    if (!tomorrowCell) { test.skip(); return; }
    const chip = tomorrowCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE }).first();
    await expect(chip).toBeVisible({ timeout: 5000 });

    const dayAfterTomorrowCell = await findDayCell(page, dayAfterTomorrow.getDate(), false);
    if (!dayAfterTomorrowCell) { test.skip(); return; }

    await drag(page, chip, dayAfterTomorrowCell);
    await expect(page.getByText('Move Recurring Task')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'This and following' }).click();
    await page.waitForTimeout(1500);

    // Tomorrow should be empty for this task (old series ended before it)
    await expect(tomorrowCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE })).not.toBeVisible();

    // Day-after-tomorrow should have the chip (new series starts here)
    await expect(dayAfterTomorrowCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE })).toBeVisible({ timeout: 5000 });

    // The old next-cycle date (today+7) should be empty; the new next-cycle (today+9) should have a chip
    const originalNextCell = await findDayCell(page, originalNextCycle.getDate(), false);
    if (originalNextCell) {
      await expect(originalNextCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE })).not.toBeVisible();
    }

    const newNextCycleCell = await findDayCell(page, newNextCycle.getDate(), false);
    if (newNextCycleCell) {
      await expect(newNextCycleCell.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE })).toBeVisible({ timeout: 5000 });
    }
  });
});
