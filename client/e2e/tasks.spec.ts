import { test, expect } from './fixtures';

const PROJECT_NAME = `Task Project ${Date.now()}`;

test.describe('Tasks', () => {
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
    await projectEntry.locator('button').click();
    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });
  });
});
