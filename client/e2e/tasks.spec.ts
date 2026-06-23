import { test, expect } from './fixtures';
import type { APIRequestContext } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'admin123';
const PROJECT_NAME = `Task Project ${Date.now()}`;

async function deleteTasksTestProjects(request: APIRequestContext): Promise<void> {
  const loginRes = await request.post('/api/auth/login', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  if (!loginRes.ok()) return;
  const token: string = (await loginRes.json()).accessToken;

  const projectsRes = await request.get('/api/projects', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!projectsRes.ok()) return;
  const projects: Array<{ id: string; name: string }> = await projectsRes.json();
  const testProjects = projects.filter(p =>
    p.name.startsWith('Undo Test ') ||
    p.name.startsWith('Task Project ') ||
    p.name.startsWith('Time Input Test '),
  );
  for (const p of testProjects) {
    await request.delete(`/api/projects/${p.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

test.describe('Tasks', () => {
  test.beforeAll(async ({ request }) => {
    await deleteTasksTestProjects(request);
  });

  test.afterAll(async ({ request }) => {
    await deleteTasksTestProjects(request);
  });

  test('undo task completion via toast', async ({ page }) => {
    const sidebar = page.locator('aside');
    const projectName = `Undo Test ${Date.now()}`;

    // Create a project
    await sidebar.getByTitle('New project').click();
    await page.getByPlaceholder('Project name').fill(projectName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });

    // Add a task
    const input = page.getByPlaceholder('Add a task...');
    await input.fill('Undo test task');
    await input.press('Enter');
    await expect(page.getByText('Undo test task')).toBeVisible();

    // Complete the task
    const taskRow = page.locator('.group', { hasText: 'Undo test task' });
    await taskRow.locator('button').first().click();

    // Task should disappear from active list
    await expect(page.getByText('Undo test task')).not.toBeVisible({ timeout: 5000 });

    // Undo button should appear in the toast
    const undoButton = page.getByRole('button', { name: 'Undo' });
    await expect(undoButton).toBeVisible({ timeout: 5000 });

    // Click undo
    await undoButton.click();

    // Task should reappear as incomplete
    await expect(page.getByText('Undo test task')).toBeVisible({ timeout: 5000 });

    // Cleanup: delete the project via sidebar
    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: projectName }).locator('..');
    await projectEntry.hover();

    page.on('dialog', dialog => dialog.accept());
    await projectEntry.locator('button').last().click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });
  });

  test('time-only natural input sets today as due date', async ({ page }) => {
    const sidebar = page.locator('aside');
    const projectName = `Time Input Test ${Date.now()}`;

    // Create a project
    await sidebar.getByTitle('New project').click();
    await page.getByPlaceholder('Project name').fill(projectName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });

    // Type a task with time-only natural input
    const input = page.getByPlaceholder('Add a task...');
    await input.fill('Check emails 4pm');

    // Chip should appear — it contains "Today" and a time (locale-agnostic check)
    const chip = page.locator('span').filter({ hasText: /Today/ }).first();
    await expect(chip).toBeVisible({ timeout: 3000 });

    // Submit
    await input.press('Enter');
    await expect(page.getByText('Check emails')).toBeVisible({ timeout: 5000 });

    // Open task detail panel
    const taskRow = page.locator('.group', { hasText: 'Check emails' }).first();
    const titleText = taskRow.locator('span, p').filter({ hasText: 'Check emails' }).first();
    await titleText.click();
    await expect(page.getByPlaceholder('Task title')).toBeVisible({ timeout: 5000 });

    // Due date input should show today's date (not empty)
    const dueDateSection = page.locator('div').filter({ has: page.getByRole('button', { name: 'Pick date' }) }).first();
    const dueDateInput = dueDateSection.locator('input[type="text"]').first();
    await expect(dueDateInput).not.toHaveValue('');

    // Time input should show 4:00 in some form (16:00 in 24h locales, 4:00 PM in 12h)
    const timeInput = page.locator('input[class*="w-28"]');
    await expect(timeInput).toHaveValue(/(?:16:00|4:00)/);

    // Cleanup
    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: projectName }).locator('..');
    await projectEntry.hover();
    page.on('dialog', dialog => dialog.accept());
    await projectEntry.locator('button').last().click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });
  });

  test('create project, add tasks, complete task, verify in All Tasks, then cleanup', async ({ page }) => {
    const sidebar = page.locator('aside');

    // Create a project
    await sidebar.getByTitle('New project').click();
    await page.getByPlaceholder('Project name').fill(PROJECT_NAME);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });

    // Add first task
    const input = page.getByPlaceholder('Add a task...');
    await input.fill('My test task');
    await input.press('Enter');
    await expect(page.getByText('My test task')).toBeVisible();

    // Add second task
    await input.fill('Another test task');
    await input.press('Enter');
    await expect(page.getByText('Another test task')).toBeVisible();

    // Complete the first task by clicking its checkbox button
    const taskRow = page.locator('.group', { hasText: 'My test task' });
    await taskRow.locator('button').first().click();

    // Task should disappear from the default (incomplete) view
    await expect(page.getByText('My test task')).not.toBeVisible({ timeout: 5000 });

    // Show completed to verify it's still there
    await page.getByText('Show completed').click();
    await expect(page.getByText('My test task')).toBeVisible();

    // Verify second task shows in All Tasks via sidebar navigation
    await sidebar.getByText('All Tasks').click();
    await expect(page).toHaveURL(/\/app\/all/);
    await expect(page.getByText('Another test task')).toBeVisible();

    // Cleanup: delete the project via sidebar
    await sidebar.getByText(PROJECT_NAME).click();
    await expect(page).toHaveURL(/\/app\/projects\//);

    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: PROJECT_NAME }).locator('..');
    await projectEntry.hover();

    page.on('dialog', dialog => dialog.accept());
    await projectEntry.locator('button').last().click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });
  });
});
