import { test, expect } from './fixtures';
import type { Page, Browser, BrowserContext } from '@playwright/test';

async function loginAndGetPage(browser: Browser): Promise<{ ctx: BrowserContext; pg: Page }> {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  await pg.goto('/login');
  await pg.getByLabel('Email').fill(process.env.TEST_EMAIL ?? 'admin@example.com');
  await pg.getByLabel('Password').fill(process.env.TEST_PASSWORD ?? 'admin123');
  await pg.getByRole('button', { name: /sign in/i }).click();
  await expect(pg).toHaveURL(/\/app/, { timeout: 10000 });
  return { ctx, pg };
}

const TS = Date.now();
const PROJECT_NAME = `Recurrence Project ${TS}`;
const TASK_TITLE = `Recurring Task ${TS}`;

let projectUrl = '';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function openTaskDetailPanel(page: Page, title: string) {
  const taskRow = page.locator('.group', { hasText: title }).first();
  const titleText = taskRow.locator('span, p').filter({ hasText: title }).first();
  if (await titleText.count() > 0) {
    await titleText.click();
  } else {
    const bb = await taskRow.boundingBox();
    if (bb) {
      await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height / 2);
    }
  }
  await expect(page.getByPlaceholder('Task title')).toBeVisible({ timeout: 5000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('Recurrence', () => {
  test.beforeAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    const sidebar = pg.locator('aside');

    // Create a project
    await sidebar.getByTitle('New project').click();
    await pg.getByPlaceholder('Project name').fill(PROJECT_NAME);
    await pg.getByRole('button', { name: 'Create' }).click();
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    projectUrl = pg.url();

    // Add a task with today's due date
    const input = pg.getByPlaceholder('Add a task...');
    await input.fill(TASK_TITLE);
    await input.press('Enter');
    await expect(pg.getByText(TASK_TITLE)).toBeVisible({ timeout: 5000 });

    // Open detail panel and set due date to today
    await openTaskDetailPanel(pg, TASK_TITLE);
    await pg.getByRole('button', { name: 'Pick date' }).click();
    const calendarPopup = pg.locator('.absolute.top-full');
    await expect(calendarPopup).toBeVisible({ timeout: 3000 });
    const todayNum = String(new Date().getDate());
    const todayButton = calendarPopup.locator('button').filter({ hasText: new RegExp(`^${todayNum}$`) }).first();
    await todayButton.click();
    await pg.waitForTimeout(300);

    // Set recurrence to "Every day"
    const repeatButton = pg.locator('button', { hasText: 'Repeat' });
    await repeatButton.click();
    await pg.getByText('Every day').click();
    await pg.waitForTimeout(500);

    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
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

  test('recurring task appears in project view with occurrence date', async ({ page }) => {
    await page.goto(projectUrl);
    await expect(page.getByText(TASK_TITLE)).toBeVisible({ timeout: 5000 });

    // Open detail panel and verify it shows recurrence info
    await openTaskDetailPanel(page, TASK_TITLE);
    await expect(page.locator('button', { hasText: 'Every day' })).toBeVisible({ timeout: 3000 });
  });

  test('recurring task shows in calendar on multiple days', async ({ page }) => {
    await page.goto('/app/calendar');

    // Switch to Month view
    const viewPickerBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
    await viewPickerBtn.click();
    await page.getByRole('button', { name: 'Month', exact: true }).last().click();
    await page.waitForTimeout(500);

    // Task chips use border-left style from project color — verify multiple appear on the calendar
    const chips = page.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE });
    await expect(chips.first()).toBeVisible({ timeout: 5000 });
    const chipCount = await chips.count();
    expect(chipCount).toBeGreaterThan(1);
  });

  test('completing in project view advances to next occurrence', async ({ page }) => {
    await page.goto(projectUrl);
    await expect(page.getByText(TASK_TITLE)).toBeVisible({ timeout: 5000 });

    // Complete the task by clicking its checkbox
    const taskRow = page.locator('.group', { hasText: TASK_TITLE });
    await taskRow.locator('button').first().click();
    await page.waitForTimeout(1000);

    // Task should still be visible (next occurrence takes its place)
    await expect(page.getByText(TASK_TITLE)).toBeVisible({ timeout: 5000 });

    // Open detail panel — the due date should have advanced to tomorrow
    await openTaskDetailPanel(page, TASK_TITLE);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowFormatted = formatDateOnly(tomorrow);
    // The date input or display should show tomorrow's date
    const dateInput = page.locator('input[type="date"]');
    if (await dateInput.count() > 0) {
      await expect(dateInput).toHaveValue(tomorrowFormatted);
    }
  });

  test('completion in project view reflects in calendar view', async ({ page }) => {
    // The first occurrence (today) was completed in the previous test
    await page.goto('/app/calendar');

    // Switch to Month view
    const viewPickerBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
    await viewPickerBtn.click();
    await page.getByRole('button', { name: 'Month', exact: true }).last().click();
    await page.waitForTimeout(500);

    // Today's occurrence should be struck out (completed)
    const todayCell = page.locator('div[class*="cursor-pointer"][class*="min-h"]').filter({
      has: page.locator('.bg-blue-600.rounded-full'),
    }).first();

    // Look for a struck-out task chip on today
    const completedChip = todayCell.locator('.line-through', { hasText: TASK_TITLE });
    await expect(completedChip).toBeVisible({ timeout: 5000 });
  });

  test('completing in calendar view reflects in project view', async ({ page }) => {
    // Navigate to calendar and complete tomorrow's occurrence via chip -> detail panel
    await page.goto('/app/calendar');

    const viewPickerBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
    await viewPickerBtn.click();
    await page.getByRole('button', { name: 'Month', exact: true }).last().click();
    await page.waitForTimeout(500);

    // Find tomorrow's chip and click it to open detail panel
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowFormatted = formatDateOnly(tomorrow);

    // Find the chip for tomorrow's occurrence — chips have border-left style
    const allChips = page.locator('[style*="border-left"]').filter({ hasText: TASK_TITLE });
    const chipCount = await allChips.count();

    // Click the second non-completed chip (first was completed in earlier test)
    let clicked = false;
    for (let i = 0; i < chipCount; i++) {
      const chip = allChips.nth(i);
      const hasLineThrough = await chip.evaluate(el => !!el.querySelector('.line-through'));
      if (!hasLineThrough && !clicked) {
        await chip.click();
        clicked = true;
        break;
      }
    }

    // Detail panel should open — click the checkbox to complete
    const detailCheckbox = page.locator('button').filter({ has: page.locator('svg') }).locator('..').locator('button').first();
    // The detail panel has a checkbox button as the first button in the title row
    const titleRow = page.getByPlaceholder('Task title').locator('..');
    await expect(titleRow).toBeVisible({ timeout: 5000 });
    const checkbox = titleRow.locator('button').first();
    await checkbox.click();
    await page.waitForTimeout(1000);

    // Now switch to the project view
    await page.goto(projectUrl);
    await expect(page.getByText(TASK_TITLE)).toBeVisible({ timeout: 5000 });

    // The task should show the day after tomorrow (since today and tomorrow are completed)
    await openTaskDetailPanel(page, TASK_TITLE);
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const expectedDate = formatDateOnly(dayAfterTomorrow);
    const dateInput = page.locator('input[type="date"]');
    if (await dateInput.count() > 0) {
      await expect(dateInput).toHaveValue(expectedDate);
    }
  });

  test('show completed includes completed occurrences in project view', async ({ page }) => {
    await page.goto(projectUrl);

    // Click "Show completed"
    await page.getByText('Show completed').click();
    await page.waitForTimeout(500);

    // Should see the recurring task title at least twice (completed occurrences + next upcoming)
    const taskItems = page.locator('.group', { hasText: TASK_TITLE });
    const count = await taskItems.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
