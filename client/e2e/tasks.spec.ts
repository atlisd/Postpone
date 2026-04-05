import { test, expect } from './fixtures';

const PROJECT_NAME = `Task Project ${Date.now()}`;

test.describe('Tasks', () => {
  test('undo task completion via toast', async ({ page }) => {
    const sidebar = page.locator('aside');

    // Create a project
    await sidebar.getByTitle('New project').click();
    await page.getByPlaceholder('Project name').fill('Undo Test Project');
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
    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: 'Undo Test Project' }).locator('..');
    await projectEntry.hover();

    page.on('dialog', dialog => dialog.accept());
    await projectEntry.locator('button').last().click();
    await page.getByRole('button', { name: 'Delete' }).click();

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
    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });
  });
});
