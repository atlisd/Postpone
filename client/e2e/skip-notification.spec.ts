import { test, expect } from './fixtures';
import type { Browser, BrowserContext, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const TS = Date.now();
const PROJECT_NAME = `Skip Notif Project ${TS}`;
const TASK_TITLE = `Skip Notif Task ${TS}`;

let projectUrl = '';

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
  const textEl = taskRow.locator('span, p, div').filter({ hasText: title }).last();
  if (await textEl.count() > 0) {
    await textEl.click();
  } else {
    const bb = await taskRow.boundingBox();
    if (bb) await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height / 2);
  }
  await expect(page.getByPlaceholder('Task title')).toBeVisible({ timeout: 5000 });
}

async function setDueDateAndTime(page: Page) {
  await page.getByRole('button', { name: 'Pick date' }).click();
  const calendarPopup = page.locator('.absolute.top-full');
  await expect(calendarPopup).toBeVisible({ timeout: 3000 });
  const todayNum = String(new Date().getDate());
  await calendarPopup.locator('button', { hasText: todayNum }).first().click();
  await page.waitForTimeout(300);

  const timeInput = page.locator('input[class*="w-28"]');
  await timeInput.fill('14:00');
  await timeInput.press('Tab');
  await page.waitForTimeout(500);
}

test.describe('Skip Notification', () => {
  test.beforeAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    const sidebar = pg.locator('aside');

    await sidebar.getByTitle('New project').click();
    await pg.getByPlaceholder('Project name').fill(PROJECT_NAME);
    await pg.getByRole('button', { name: 'Create' }).click();
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    projectUrl = pg.url();

    const input = pg.getByPlaceholder('Add a task...');
    await input.fill(TASK_TITLE);
    await input.press('Enter');
    await expect(pg.getByText(TASK_TITLE)).toBeVisible({ timeout: 5000 });
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    const sidebar = pg.locator('aside');
    await pg.goto(projectUrl);
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });

    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: PROJECT_NAME }).locator('..');
    await projectEntry.hover();
    pg.on('dialog', dialog => dialog.accept());
    await projectEntry.locator('button').last().click();
    await pg.getByRole('button', { name: 'Delete' }).click();
    await expect(pg).toHaveURL(/\/app\/today/, { timeout: 10000 });
    await ctx.close();
  });

  test('skip notification checkbox is visible in task detail panel', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);
    await expect(page.getByRole('checkbox', { name: /skip notification/i })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /skip notification/i })).not.toBeChecked();
  });

  test('checking skip notification persists after reload', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);

    await page.getByRole('checkbox', { name: /skip notification/i }).check();
    await page.waitForTimeout(500);

    await page.reload();
    await openTaskDetailPanel(page, TASK_TITLE);
    await expect(page.getByRole('checkbox', { name: /skip notification/i })).toBeChecked();
  });

  test('checking skip notification grays out reminder section', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);
    await setDueDateAndTime(page);

    // Reminder section should be accessible when skip is checked
    await expect(page.getByRole('button', { name: 'Add reminder' })).toBeVisible({ timeout: 3000 });

    // Skip is already checked from previous test — verify reminders wrapper has opacity-40 + pointer-events-none
    await expect(page.getByRole('checkbox', { name: /skip notification/i })).toBeChecked();
    const remindersWrapper = page.locator('div.opacity-40.pointer-events-none');
    await expect(remindersWrapper).toBeVisible();
  });

  test('unchecking skip notification re-enables reminder section', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);

    await page.getByRole('checkbox', { name: /skip notification/i }).uncheck();
    await page.waitForTimeout(500);

    // The grayed-out wrapper should be gone
    await expect(page.locator('div.opacity-40.pointer-events-none')).not.toBeVisible();

    // Add reminder button should be interactable
    await expect(page.getByRole('button', { name: 'Add reminder' })).toBeVisible({ timeout: 3000 });
  });

  test('unchecked state persists after reload', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);

    // Was unchecked in previous test
    await expect(page.getByRole('checkbox', { name: /skip notification/i })).not.toBeChecked();

    await page.reload();
    await openTaskDetailPanel(page, TASK_TITLE);
    await expect(page.getByRole('checkbox', { name: /skip notification/i })).not.toBeChecked();
  });
});
