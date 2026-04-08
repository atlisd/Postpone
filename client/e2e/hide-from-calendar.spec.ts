import { test, expect } from './fixtures';
import type { Browser, BrowserContext, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const TS = Date.now();
const PROJECT_NAME = `Hide Cal Project ${TS}`;
const TASK_TITLE = `Hide Cal Task ${TS}`;

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

let projectUrl = '';

test.describe('Hide from calendar', () => {
  test.beforeAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    const sidebar = pg.locator('aside');

    // Create project
    await sidebar.getByTitle('New project').click();
    await pg.getByPlaceholder('Project name').fill(PROJECT_NAME);
    await pg.getByRole('button', { name: 'Create' }).click();
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    projectUrl = pg.url();

    // Create task directly from the calendar so today's date is set automatically
    await pg.goto('/app/calendar');

    // Ensure Month view
    const viewPickerBtn = pg.locator('button').filter({ has: pg.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
    await viewPickerBtn.click();
    await pg.getByRole('button', { name: 'Month' }).last().click();
    await pg.waitForTimeout(300);

    // Click today's cell
    const todayCell = pg.locator('div[class*="cursor-pointer"][class*="min-h"]').filter({
      has: pg.locator('.bg-blue-600.rounded-full'),
    }).first();
    await todayCell.click();

    const titleInput = pg.getByPlaceholder('Task title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.fill(TASK_TITLE);

    // Select the test project
    const projectSelect = pg.locator('select').first();
    if (await projectSelect.count() > 0) {
      await projectSelect.selectOption({ label: PROJECT_NAME });
    }

    await pg.getByRole('button', { name: 'Add' }).click();
    await pg.waitForTimeout(500);

    await expect(pg.locator('div', { hasText: TASK_TITLE }).first()).toBeVisible({ timeout: 5000 });

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

  test('task appears on calendar when not hidden', async ({ page }) => {
    await page.goto('/app/calendar');

    // Switch to Month view
    const viewPickerBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
    await viewPickerBtn.click();
    await page.getByRole('button', { name: 'Month' }).last().click();
    await page.waitForTimeout(400);

    // Task chip should be visible on today's cell
    const chip = page.locator('[class*="cursor-pointer"]', { hasText: TASK_TITLE }).first();
    await expect(chip).toBeVisible({ timeout: 5000 });
  });

  test('hide from calendar toggle persists after reload', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);

    // Find the hide button by its tooltip sibling text
    const hideWrapper = page.locator('div').filter({ hasText: /^Hide from calendar$/ }).first();
    const hideBtn = hideWrapper.locator('button');
    await expect(hideBtn).toBeVisible({ timeout: 5000 });
    await hideBtn.click();
    await page.waitForTimeout(600);

    // After click, tooltip should say "Show in calendar"
    const showWrapper = page.locator('div').filter({ hasText: /^Show in calendar$/ }).first();
    await expect(showWrapper).toBeAttached({ timeout: 3000 });

    // Reload and verify state persisted
    await page.reload();
    await openTaskDetailPanel(page, TASK_TITLE);
    await expect(page.locator('div').filter({ hasText: /^Show in calendar$/ }).first()).toBeAttached({ timeout: 5000 });
  });

  test('hidden task does not appear on calendar', async ({ page }) => {
    await page.goto('/app/calendar');

    // Switch to Month view
    const viewPickerBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
    await viewPickerBtn.click();
    await page.getByRole('button', { name: 'Month' }).last().click();
    await page.waitForTimeout(400);

    // Task chip should NOT be visible
    const chip = page.locator('[class*="truncate"]', { hasText: TASK_TITLE });
    await expect(chip).toHaveCount(0);
  });

  test('unhiding task makes it reappear on calendar', async ({ page }) => {
    // Unhide
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);
    const showWrapper = page.locator('div').filter({ hasText: /^Show in calendar$/ }).first();
    const showBtn = showWrapper.locator('button');
    await expect(showBtn).toBeVisible({ timeout: 5000 });
    await showBtn.click();
    await page.waitForTimeout(600);
    await expect(page.locator('div').filter({ hasText: /^Hide from calendar$/ }).first()).toBeAttached({ timeout: 3000 });

    // Verify calendar shows task again
    await page.goto('/app/calendar');
    const viewPickerBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
    await viewPickerBtn.click();
    await page.getByRole('button', { name: 'Month' }).last().click();
    await page.waitForTimeout(400);

    const chip = page.locator('[class*="cursor-pointer"]', { hasText: TASK_TITLE }).first();
    await expect(chip).toBeVisible({ timeout: 5000 });
  });
});
