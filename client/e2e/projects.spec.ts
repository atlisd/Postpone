import { test, expect } from './fixtures';

const PROJECT_NAME = `Test Project ${Date.now()}`;

test.describe('Projects', () => {
  test('create a project, verify sidebar, then delete', async ({ page }) => {
    const sidebar = page.locator('aside');

    // Create
    await sidebar.getByTitle('New project').click();
    await page.getByPlaceholder('Project name').fill(PROJECT_NAME);
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    await expect(sidebar.getByText(PROJECT_NAME)).toBeVisible();
    await expect(page.getByText('No tasks yet')).toBeVisible();

    // Delete via context menu
    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: PROJECT_NAME }).locator('..');
    await projectEntry.hover();

    page.on('dialog', dialog => dialog.accept());
    await projectEntry.locator('button').last().click();
    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });
    await expect(sidebar.getByText(PROJECT_NAME)).not.toBeVisible();
  });
});
