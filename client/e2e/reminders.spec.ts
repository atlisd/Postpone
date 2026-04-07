import { test, expect } from './fixtures';
import type { Browser, BrowserContext, Page } from '@playwright/test';

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

const PROJECT_NAME = `Reminder Test Project ${Date.now()}`;
const TASK_TITLE = `Reminder Test Task ${Date.now()}`;

let projectUrl = '';

async function openTaskDetailPanel(page: Page, title: string) {
  // Click the text portion of the task row (avoids the checkbox)
  const taskContent = page.locator('.group', { hasText: title }).first();
  const textEl = taskContent.locator('span, p, div').filter({ hasText: title }).last();
  if (await textEl.count() > 0) {
    await textEl.click();
  } else {
    const bb = await taskContent.boundingBox();
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

test.describe.configure({ mode: 'serial' });

test.describe('Task Reminders', () => {
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

  test('reminder section hidden when no due time is set', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);
    await expect(page.getByRole('button', { name: 'Add reminder' })).not.toBeVisible();
  });

  test('reminder section appears after setting due date and time', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);
    await setDueDateAndTime(page);
    await expect(page.getByRole('button', { name: 'Add reminder' })).toBeVisible({ timeout: 3000 });
  });

  test('add preset reminder - 15 minutes before', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);
    await expect(page.getByRole('button', { name: 'Add reminder' })).toBeVisible({ timeout: 3000 });

    await page.getByRole('button', { name: 'Add reminder' }).click();
    await page.getByRole('button', { name: '15 minutes before' }).click();

    await expect(page.locator('span', { hasText: '15 min before' })).toBeVisible({ timeout: 3000 });

    // Reload and verify persistence
    await page.reload();
    await openTaskDetailPanel(page, TASK_TITLE);
    await expect(page.locator('span', { hasText: '15 min before' })).toBeVisible({ timeout: 3000 });
  });

  test('already-added preset is filtered from dropdown', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);

    await page.getByRole('button', { name: 'Add reminder' }).click();
    // "15 minutes before" was added in previous test — it should not appear
    await expect(page.getByRole('button', { name: '15 minutes before' })).not.toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('add custom reminder - 2 hours', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);

    await page.getByRole('button', { name: 'Add reminder' }).click();
    await page.getByPlaceholder('0').fill('2');
    await page.getByRole('combobox', { name: 'Reminder unit' }).selectOption('hours');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.locator('span', { hasText: '2 hours before' })).toBeVisible({ timeout: 3000 });
  });

  test('delete a reminder', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);

    const chip = page.locator('span', { hasText: '15 min before' });
    await expect(chip).toBeVisible({ timeout: 3000 });
    await chip.getByRole('button').click();

    await expect(page.locator('span', { hasText: '15 min before' })).not.toBeVisible({ timeout: 3000 });

    // Verify deletion persisted
    await page.reload();
    await openTaskDetailPanel(page, TASK_TITLE);
    await expect(page.locator('span', { hasText: '15 min before' })).not.toBeVisible();
    await expect(page.locator('span', { hasText: '2 hours before' })).toBeVisible();
  });

  test('clearing due time hides reminder section', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, TASK_TITLE);
    await expect(page.getByRole('button', { name: 'Add reminder' })).toBeVisible({ timeout: 3000 });

    // Clear the time field
    const timeInput = page.locator('input[class*="w-28"]');
    await timeInput.fill('');
    await timeInput.press('Tab');
    await page.waitForTimeout(300);

    await expect(page.getByRole('button', { name: 'Add reminder' })).not.toBeVisible();
  });
});
