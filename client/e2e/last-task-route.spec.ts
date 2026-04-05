import { test, expect } from './fixtures';

const PROJECT_NAME = `NavRestore Project ${Date.now()}`;

test.describe('Last task route restoration', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await pg.goto('/login');
    await pg.getByLabel('Email').fill(process.env.TEST_EMAIL ?? 'test@example.com');
    await pg.getByLabel('Password').fill(process.env.TEST_PASSWORD ?? 'TestPassword123!');
    await pg.getByRole('button', { name: /sign in/i }).click();
    await expect(pg).toHaveURL(/\/app/, { timeout: 10000 });

    await pg.locator('aside').nth(1).getByTitle('New project').click();
    await pg.getByPlaceholder('Project name').fill(PROJECT_NAME);
    await pg.getByRole('button', { name: 'Create' }).click();
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await pg.goto('/login');
    await pg.getByLabel('Email').fill(process.env.TEST_EMAIL ?? 'test@example.com');
    await pg.getByLabel('Password').fill(process.env.TEST_PASSWORD ?? 'TestPassword123!');
    await pg.getByRole('button', { name: /sign in/i }).click();
    await expect(pg).toHaveURL(/\/app/, { timeout: 10000 });

    const sidebar = pg.locator('aside').nth(1);
    await sidebar.getByText(PROJECT_NAME).click();
    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: PROJECT_NAME }).locator('..');
    await projectEntry.hover();
    pg.on('dialog', dialog => dialog.accept());
    await projectEntry.locator('button').last().click();
    await pg.getByRole('button', { name: 'Delete' }).click();
    await ctx.close();
  });

  test('returns to Tomorrow after switching to calendar and back', async ({ page }) => {
    const iconBar = page.locator('aside').first();
    const sidebar = page.locator('aside').nth(1);

    await sidebar.getByText('Tomorrow').click();
    await expect(page).toHaveURL(/\/app\/tomorrow/);

    await iconBar.getByTitle('Calendar').click();
    await expect(page).toHaveURL(/\/app\/calendar/);

    await iconBar.getByTitle('Tasks').click();
    await expect(page).toHaveURL(/\/app\/tomorrow/);
  });

  test('returns to a project after switching to calendar and back', async ({ page }) => {
    const iconBar = page.locator('aside').first();
    const sidebar = page.locator('aside').nth(1);

    await sidebar.getByText(PROJECT_NAME).click();
    await expect(page).toHaveURL(/\/app\/projects\//);
    const projectUrl = page.url();

    await iconBar.getByTitle('Calendar').click();
    await expect(page).toHaveURL(/\/app\/calendar/);

    await iconBar.getByTitle('Tasks').click();
    await expect(page).toHaveURL(projectUrl);
  });

  test('defaults to Today when no previous task route is stored', async ({ page }) => {
    const iconBar = page.locator('aside').first();

    await page.evaluate(() => localStorage.removeItem('last-task-route'));

    await page.goto('/app/calendar');
    await expect(page).toHaveURL(/\/app\/calendar/);

    await iconBar.getByTitle('Tasks').click();
    await expect(page).toHaveURL(/\/app\/today/);
  });
});
