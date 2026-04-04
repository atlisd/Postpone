import { test, expect } from './fixtures';

const TS = Date.now();
const RENAME_SOURCE = `Rename Me ${TS}`;
const RENAME_TARGET = `Renamed Project ${TS}`;
const PROJECT_A = `Project A ${TS}`;
const PROJECT_B = `Project B ${TS}`;

test.describe('Project Operations', () => {
  test('rename a project', async ({ page }) => {
    const sidebar = page.locator('aside');

    // Create project
    await sidebar.getByTitle('New project').click();
    await page.getByPlaceholder('Project name').fill(RENAME_SOURCE);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    await expect(sidebar.getByText(RENAME_SOURCE)).toBeVisible();

    // Open context menu: hover project entry, click MoreHorizontal button
    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: RENAME_SOURCE }).locator('..');
    await projectEntry.hover();
    await projectEntry.locator('button').last().click();

    // Click Edit in context menu (portalled to body)
    await page.getByRole('button', { name: 'Edit' }).click();

    // ProjectFormModal opens with "Edit Project" heading
    await expect(page.getByPlaceholder('Project name')).toBeVisible({ timeout: 3000 });
    await page.getByPlaceholder('Project name').clear();
    await page.getByPlaceholder('Project name').fill(RENAME_TARGET);
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify sidebar shows new name
    await expect(sidebar.getByText(RENAME_TARGET)).toBeVisible({ timeout: 5000 });
    await expect(sidebar.getByText(RENAME_SOURCE)).not.toBeVisible();

    // Reload and verify rename persisted
    await page.reload();
    await expect(sidebar.getByText(RENAME_TARGET)).toBeVisible({ timeout: 5000 });

    // Cleanup: delete project
    const renamedEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: RENAME_TARGET }).locator('..');
    await renamedEntry.hover();
    page.on('dialog', dialog => dialog.accept());
    await renamedEntry.locator('button').last().click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });
    await expect(sidebar.getByText(RENAME_TARGET)).not.toBeVisible();
  });

  test('move task between projects', async ({ page }) => {
    const sidebar = page.locator('aside');

    // Create project A
    await sidebar.getByTitle('New project').click();
    await page.getByPlaceholder('Project name').fill(PROJECT_A);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    const projectAUrl = page.url();

    // Create project B
    await sidebar.getByTitle('New project').click();
    await page.getByPlaceholder('Project name').fill(PROJECT_B);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });

    // Navigate to project A and add a task
    await page.goto(projectAUrl);
    await expect(page).toHaveURL(/\/app\/projects\//);
    const taskInput = page.getByPlaceholder('Add a task...');
    await taskInput.fill('Move Me Task');
    await taskInput.press('Enter');
    await expect(page.getByText('Move Me Task')).toBeVisible({ timeout: 5000 });

    // Click task to open detail panel
    const taskRow = page.locator('.group', { hasText: 'Move Me Task' }).first();
    const bb = await taskRow.boundingBox();
    if (bb) {
      await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height / 2);
    }
    await expect(page.getByPlaceholder('Task title')).toBeVisible({ timeout: 5000 });

    // The project select is the first <select> in the detail panel (header)
    // Wait for project options to be populated (listProjects() async call)
    const projectSelect = page.locator('select').first();
    await expect(projectSelect).toBeVisible();
    await expect(projectSelect).toContainText(PROJECT_B, { timeout: 5000 });
    await projectSelect.selectOption({ label: PROJECT_B });
    await page.waitForTimeout(500);

    // Task should be gone from project A
    await expect(page.getByText('Move Me Task')).not.toBeVisible({ timeout: 5000 });

    // Navigate to project B and verify task is there
    await sidebar.getByText(PROJECT_B).click();
    await expect(page).toHaveURL(/\/app\/projects\//);
    await expect(page.getByText('Move Me Task')).toBeVisible({ timeout: 5000 });

    // Cleanup: delete both projects
    const cleanupProject = async (name: string) => {
      const entry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: name }).locator('..');
      await entry.hover();
      await entry.locator('button').last().click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });
    };

    page.on('dialog', dialog => dialog.accept());
    await sidebar.getByText(PROJECT_B).click();
    await cleanupProject(PROJECT_B);
    await sidebar.getByText(PROJECT_A).click();
    await cleanupProject(PROJECT_A);
  });
});
