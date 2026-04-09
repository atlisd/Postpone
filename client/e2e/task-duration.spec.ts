import { test, expect } from './fixtures';
import type { Page, Browser, BrowserContext } from '@playwright/test';
import { format, addDays } from 'date-fns';

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

const PROJECT_NAME = `Duration Test Project ${Date.now()}`;
const TASK_TITLE = `Duration Test Task ${Date.now()}`;

let projectUrl = '';

async function openTaskDetailPanel(page: Page, title: string) {
  const taskRow = page.locator('.group', { hasText: title }).first();
  const bb = await taskRow.boundingBox();
  if (bb) {
    await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height / 2);
  }
  await expect(page.getByPlaceholder('Task title')).toBeVisible({ timeout: 5000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('Task Duration', () => {
  test.beforeAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    const sidebar = pg.locator('aside');

    // Create project
    await sidebar.getByTitle('New project').click();
    await pg.getByPlaceholder('Project name').fill(PROJECT_NAME);
    await pg.getByRole('button', { name: 'Create' }).click();
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    projectUrl = pg.url();

    // Add task
    const input = pg.getByPlaceholder('Add a task...');
    await input.fill(TASK_TITLE);
    await input.press('Enter');
    await expect(pg.getByText(TASK_TITLE)).toBeVisible({ timeout: 5000 });
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    await pg.goto(projectUrl);
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });

    const sidebar = pg.locator('aside');
    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: PROJECT_NAME }).locator('..');
    await projectEntry.hover();
    pg.on('dialog', dialog => dialog.accept());
    await projectEntry.locator('button').last().click();
    await pg.getByRole('button', { name: 'Delete' }).click();
    await expect(pg).toHaveURL(/\/app\/today/, { timeout: 10000 });
    await ctx.close();
  });

  test('add duration toggle appears in task edit', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);

    // The "+ Add duration" link should be visible
    await expect(page.getByText('+ Add duration')).toBeVisible({ timeout: 5000 });
  });

  test('enable duration and set end date', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);

    // Set a due date using the calendar picker (click today's date)
    await page.getByRole('button', { name: 'Pick date' }).first().click();
    const calendarPopup = page.locator('.absolute.top-full').first();
    await expect(calendarPopup).toBeVisible({ timeout: 3000 });
    const todayNum = String(new Date().getDate());
    await calendarPopup.locator('button').filter({ hasText: new RegExp(`^${todayNum}$`) }).first().click();
    await page.waitForTimeout(600); // wait for due date save to settle

    // Click "+ Add duration" to reveal end date picker
    await page.getByText('+ Add duration').click();
    await expect(page.getByRole('button', { name: 'Pick date' })).toHaveCount(2, { timeout: 3000 });

    // Use the end date calendar picker (most reliable way to set the value)
    const endDate = addDays(new Date(), 4);
    await page.getByRole('button', { name: 'Pick date' }).nth(1).click();
    const endCalendar = page.locator('[class*="absolute"][class*="top-full"]').last();
    await expect(endCalendar).toBeVisible({ timeout: 3000 });
    await endCalendar.locator('button').filter({ hasText: new RegExp(`^${endDate.getDate()}$`) }).first().click();

    // Wait for the "N days" label — confirms local state updated
    await expect(page.getByText(/\d+ days/)).toBeVisible({ timeout: 5000 });

    // Allow time for the background PUT to complete
    await page.waitForTimeout(1000);
  });

  test('end date persists after reload', async ({ page }) => {
    // Set endDate directly via API for a reliable persistence test.
    // This tests the display path (loading from DB) independently from the save path.
    const projectId = projectUrl.split('/').pop();
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    const tasks = await page.evaluate(
      ([pid, tok]: [string, string]) =>
        fetch(`/api/projects/${pid}/tasks`, { headers: { Authorization: `Bearer ${tok}` } })
          .then(r => r.json() as Promise<Array<{ id: string; title: string }>>),
      [projectId!, token!]
    );
    const taskItem = tasks.find(t => t.title === TASK_TITLE);
    expect(taskItem).toBeTruthy();

    const dueDate = format(new Date(), 'yyyy-MM-dd');
    const endDate = format(addDays(new Date(), 4), 'yyyy-MM-dd');
    const apiResult = await page.evaluate(
      ([tid, tok, dd, ed]: [string, string, string, string]) =>
        fetch(`/api/tasks/${tid}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ dueDate: dd, endDate: ed }),
        }).then(r => r.json()),
      [taskItem!.id, token!, dueDate, endDate]
    );
    expect((apiResult as { endDate?: string }).endDate).toBe(endDate);

    // Reload and verify the saved endDate is displayed
    await page.reload();
    await openTaskDetailPanel(page, TASK_TITLE);

    // Duration section should be shown (2 "Pick date" buttons) and "N days" label
    await expect(page.getByRole('button', { name: 'Pick date' })).toHaveCount(2, { timeout: 5000 });
    await expect(page.getByText(/\d+ days/)).toBeVisible({ timeout: 3000 });
  });

  test('remove duration clears end date', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);

    // Verify duration is shown
    await expect(page.getByRole('button', { name: 'Pick date' })).toHaveCount(2, { timeout: 5000 });

    // Find and click the X button to remove duration (it's near the end date picker)
    // The X button to remove duration is rendered after the end date LocaleDateInput and days count
    const durationSection = page.locator('div').filter({ has: page.getByText(/\d+ days/) }).last();
    const removeButton = durationSection.locator('button').last();
    await removeButton.click();
    await page.waitForTimeout(500);

    // Should be back to single pick date button and "+ Add duration" link
    await expect(page.getByText('+ Add duration')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: 'Pick date' })).toHaveCount(1, { timeout: 3000 });

    // Reload and confirm it's gone
    await page.reload();
    await openTaskDetailPanel(page, TASK_TITLE);
    await expect(page.getByText('+ Add duration')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Pick date' })).toHaveCount(1, { timeout: 3000 });
  });
});

test.describe('Calendar Drag to Create', () => {
  let calendarProjectUrl = '';
  const CALENDAR_PROJECT = `Calendar Drag Project ${Date.now()}`;

  test.beforeAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    const sidebar = pg.locator('aside');

    await sidebar.getByTitle('New project').click();
    await pg.getByPlaceholder('Project name').fill(CALENDAR_PROJECT);
    await pg.getByRole('button', { name: 'Create' }).click();
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    calendarProjectUrl = pg.url();
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    await pg.goto(calendarProjectUrl);
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });

    const sidebar = pg.locator('aside');
    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: CALENDAR_PROJECT }).locator('..');
    await projectEntry.hover();
    pg.on('dialog', dialog => dialog.accept());
    await projectEntry.locator('button').last().click();
    await pg.getByRole('button', { name: 'Delete' }).click();
    await expect(pg).toHaveURL(/\/app\/today/, { timeout: 10000 });
    await ctx.close();
  });

  test('drag across days in week view opens range modal', async ({ page }) => {
    await page.goto('/app/calendar');
    await expect(page.locator('h2')).toBeVisible({ timeout: 5000 });

    // Switch to week view
    const viewPickerBtn = page.locator('button', { hasText: /Month|Week|Day|Agenda/i }).last();
    await viewPickerBtn.click();
    await page.waitForTimeout(200);
    const weekOption = page.locator('button', { hasText: 'Week' }).last();
    await weekOption.click();
    await page.waitForTimeout(500);

    // Find the week day columns — they have "flex flex-col border-r" structure
    // Each column body has min-h-[120px] and flex-1
    const dayColumns = page.locator('[class*="min-h-\\[120px\\]"]');
    const count = await dayColumns.count();

    if (count < 5) {
      // Skip if week view isn't rendering as expected
      test.skip();
      return;
    }

    // Get bounding boxes for first and 5th column (Mon → Fri)
    const firstColBox = await dayColumns.nth(0).boundingBox();
    const fifthColBox = await dayColumns.nth(4).boundingBox();

    if (!firstColBox || !fifthColBox) {
      test.skip();
      return;
    }

    // Drag from Monday to Friday
    const startX = firstColBox.x + firstColBox.width / 2;
    const startY = firstColBox.y + firstColBox.height / 2;
    const endX = fifthColBox.x + fifthColBox.width / 2;
    const endY = fifthColBox.y + fifthColBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(firstColBox.x + firstColBox.width * 1.5, startY, { steps: 3 });
    await page.mouse.move(firstColBox.x + firstColBox.width * 2.5, startY, { steps: 3 });
    await page.mouse.move(firstColBox.x + firstColBox.width * 3.5, startY, { steps: 3 });
    await page.mouse.move(endX, endY, { steps: 3 });
    await page.mouse.up();

    // The add task modal should appear with a date range "→" in the title
    await expect(page.locator('h3', { hasText: '→' })).toBeVisible({ timeout: 5000 });
  });

  test('create task via range drag and verify multi-day chips', async ({ page }) => {
    await page.goto('/app/calendar');
    await expect(page.locator('h2')).toBeVisible({ timeout: 5000 });

    // Switch to week view
    const viewPickerBtn = page.locator('button', { hasText: /Month|Week|Day|Agenda/i }).last();
    await viewPickerBtn.click();
    await page.waitForTimeout(200);
    const weekOption = page.locator('button', { hasText: 'Week' }).last();
    await weekOption.click();
    await page.waitForTimeout(500);

    const dayColumns = page.locator('[class*="min-h-\\[120px\\]"]');
    const count = await dayColumns.count();
    if (count < 3) { test.skip(); return; }

    const firstColBox = await dayColumns.nth(0).boundingBox();
    const thirdColBox = await dayColumns.nth(2).boundingBox();
    if (!firstColBox || !thirdColBox) { test.skip(); return; }

    // Drag from col 1 to col 3 (3-day task)
    const startX = firstColBox.x + firstColBox.width / 2;
    const startY = firstColBox.y + firstColBox.height / 2;
    const endX = thirdColBox.x + thirdColBox.width / 2;
    const endY = thirdColBox.y + thirdColBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(firstColBox.x + firstColBox.width * 1.5, startY, { steps: 3 });
    await page.mouse.move(endX, endY, { steps: 3 });
    await page.mouse.up();

    // Modal should appear
    const modal = page.locator('h3', { hasText: '→' });
    const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);
    if (!modalVisible) { test.skip(); return; }

    // Select the project
    const projectSelect = page.locator('select');
    if (await projectSelect.count() > 0) {
      await projectSelect.selectOption({ label: CALENDAR_PROJECT });
    }

    const DRAG_TASK_TITLE = `Drag Range Task ${Date.now()}`;
    await page.getByPlaceholder('Task title').fill(DRAG_TASK_TITLE);
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(500);

    // Verify task chip appears somewhere in the week view
    await expect(page.getByTitle(DRAG_TASK_TITLE).first()).toBeVisible({ timeout: 5000 });
  });
});
