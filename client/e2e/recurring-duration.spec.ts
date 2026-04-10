import { test, expect } from './fixtures';
import type { Browser, BrowserContext, Page } from '@playwright/test';
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

const TS = Date.now();
const PROJECT_NAME = `Recurring Duration Project ${TS}`;
const TASK_WITH_DURATION = `Recurring With Duration ${TS}`;
const TASK_WITHOUT_DURATION = `Recurring No Duration ${TS}`;

const today = new Date();
const DUE_DATE = format(today, 'yyyy-MM-dd');
// 5 days duration → 6 chips (dueDate through endDate inclusive)
const END_DATE = format(addDays(today, 5), 'yyyy-MM-dd');
const DURATION_DAYS = 6;

let projectUrl = '';

test.describe.configure({ mode: 'serial' });

test.describe('Recurring task with duration', () => {
  test.beforeAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    const sidebar = pg.locator('aside');

    // Create project
    await sidebar.getByTitle('New project').click();
    await pg.getByPlaceholder('Project name').fill(PROJECT_NAME);
    await pg.getByRole('button', { name: 'Create' }).click();
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    projectUrl = pg.url();
    const projectId = pg.url().split('/').pop()!;

    const token = await pg.evaluate(() => localStorage.getItem('accessToken'));

    // Create both tasks
    for (const title of [TASK_WITH_DURATION, TASK_WITHOUT_DURATION]) {
      const input = pg.getByPlaceholder('Add a task...');
      await input.fill(title);
      await input.press('Enter');
      await expect(pg.getByText(title)).toBeVisible({ timeout: 5000 });
    }

    // Fetch task ids
    const tasks = await pg.evaluate(
      ([pid, tok]: [string, string]) =>
        fetch(`/api/projects/${pid}/tasks`, { headers: { Authorization: `Bearer ${tok}` } })
          .then(r => r.json() as Promise<Array<{ id: string; title: string }>>),
      [projectId, token!]
    );

    const taskWithDuration = tasks.find(t => t.title === TASK_WITH_DURATION);
    const taskWithoutDuration = tasks.find(t => t.title === TASK_WITHOUT_DURATION);
    expect(taskWithDuration).toBeTruthy();
    expect(taskWithoutDuration).toBeTruthy();

    // Set dueDate + endDate + monthly recurrence on the duration task
    await pg.evaluate(
      ([tid, tok, dd, ed]: [string, string, string, string]) =>
        fetch(`/api/tasks/${tid}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ dueDate: dd, endDate: ed }),
        }).then(r => r.json()),
      [taskWithDuration!.id, token!, DUE_DATE, END_DATE]
    );
    await pg.evaluate(
      ([tid, tok]: [string, string]) =>
        fetch(`/api/tasks/${tid}/recurrence`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ rrule: 'FREQ=MONTHLY' }),
        }).then(r => r.json()),
      [taskWithDuration!.id, token!]
    );

    // Set dueDate + monthly recurrence (no endDate) on the no-duration task
    await pg.evaluate(
      ([tid, tok, dd]: [string, string, string]) =>
        fetch(`/api/tasks/${tid}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ dueDate: dd }),
        }).then(r => r.json()),
      [taskWithoutDuration!.id, token!, DUE_DATE]
    );
    await pg.evaluate(
      ([tid, tok]: [string, string]) =>
        fetch(`/api/tasks/${tid}/recurrence`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ rrule: 'FREQ=MONTHLY' }),
        }).then(r => r.json()),
      [taskWithoutDuration!.id, token!]
    );

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

  test('recurring task with duration spans multiple days in calendar', async ({ page }) => {
    await page.goto('/app/calendar');
    await expect(page.locator('h2')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(800); // let calendar data load

    // Task should appear in DURATION_DAYS day cells (one chip per day of the span)
    const chips = page.locator(`[title="${TASK_WITH_DURATION}"]`);
    await expect(chips.first()).toBeVisible({ timeout: 5000 });
    const count = await chips.count();
    expect(count).toBe(DURATION_DAYS);
  });

  test('recurring task duration carries to next month occurrence', async ({ page }) => {
    await page.goto('/app/calendar');
    await expect(page.locator('h2')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(800);

    // Navigate to next month
    const todayBtn = page.getByRole('button', { name: 'Today' });
    const nextMonthBtn = todayBtn.locator('xpath=following-sibling::button[1]');
    await nextMonthBtn.click();
    await page.waitForTimeout(800);

    // The next occurrence should also span DURATION_DAYS days
    const chips = page.locator(`[title="${TASK_WITH_DURATION}"]`);
    await expect(chips.first()).toBeVisible({ timeout: 5000 });
    const count = await chips.count();
    expect(count).toBe(DURATION_DAYS);
  });

  test('recurring task without duration shows as single day in calendar', async ({ page }) => {
    await page.goto('/app/calendar');
    await expect(page.locator('h2')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(800);

    // Task without duration should appear exactly once (single chip)
    const chips = page.locator(`[title="${TASK_WITHOUT_DURATION}"]`);
    await expect(chips.first()).toBeVisible({ timeout: 5000 });
    const count = await chips.count();
    expect(count).toBe(1);
  });

  test('can remove duration from recurring task while recurrence is set', async ({ page }) => {
    await page.goto(projectUrl);
    await expect(page.getByText(TASK_WITH_DURATION)).toBeVisible({ timeout: 5000 });

    // Open task detail panel
    const taskRow = page.locator('.group', { hasText: TASK_WITH_DURATION }).first();
    const bb = await taskRow.boundingBox();
    if (bb) await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height / 2);
    await expect(page.getByPlaceholder('Task title')).toBeVisible({ timeout: 5000 });

    // Duration should be visible (2 "Pick date" buttons)
    await expect(page.getByRole('button', { name: 'Pick date' })).toHaveCount(2, { timeout: 5000 });

    // Click X to remove duration
    const durationSection = page.locator('div').filter({ has: page.getByText(/\d+ days/) }).last();
    const removeButton = durationSection.locator('button').last();
    await removeButton.click();

    // Wait for the save to complete and task to refresh
    await page.waitForTimeout(1500);

    // Reload to verify persistence — duration must be gone
    await page.reload();
    await expect(page.getByText(TASK_WITH_DURATION)).toBeVisible({ timeout: 5000 });
    const taskRow2 = page.locator('.group', { hasText: TASK_WITH_DURATION }).first();
    const bb2 = await taskRow2.boundingBox();
    if (bb2) await page.mouse.click(bb2.x + bb2.width * 0.5, bb2.y + bb2.height / 2);
    await expect(page.getByPlaceholder('Task title')).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('+ Add duration')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Pick date' })).toHaveCount(1, { timeout: 3000 });
  });
});
