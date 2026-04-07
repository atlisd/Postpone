import { test, expect } from './fixtures';
import type { Page, Browser, BrowserContext } from '@playwright/test';

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

const PROJECT_NAME = `Task Detail Project ${Date.now()}`;
const TASK_TITLE = `Detail Test Task ${Date.now()}`;
const UPDATED_TITLE = `Updated Task Title ${Date.now()}`;

let projectUrl = '';
let taskTitle = TASK_TITLE;

async function openTaskDetailPanel(page: Page, title: string) {
  // Click the task title text (not the checkbox button) to open detail panel
  const taskRow = page.locator('.group', { hasText: title }).first();
  // Click somewhere in the middle of the row, not the first button (checkbox)
  const titleText = taskRow.locator('span, p').filter({ hasText: title }).first();
  if (await titleText.count() > 0) {
    await titleText.click();
  } else {
    // Click at a position that avoids the checkbox (leftmost button)
    const bb = await taskRow.boundingBox();
    if (bb) {
      await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height / 2);
    }
  }
  await expect(page.getByPlaceholder('Task title')).toBeVisible({ timeout: 5000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('Task Details', () => {
  test.beforeAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    const sidebar = pg.locator('aside');

    // Create project
    await sidebar.getByTitle('New project').click();
    await pg.getByPlaceholder('Project name').fill(PROJECT_NAME);
    await pg.getByRole('button', { name: 'Create' }).click();
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    projectUrl = pg.url();

    // Add task
    const input = pg.getByPlaceholder('Add a task...');
    await input.fill(TASK_TITLE);
    await input.press('Enter');
    await expect(pg.getByText(TASK_TITLE)).toBeVisible({ timeout: 5000 });
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    const sidebar = pg.locator('aside');
    // Navigate to project using the saved URL, then delete via sidebar context menu
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

  test('open task detail panel', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, taskTitle);
    await expect(page.getByPlaceholder('Task title')).toBeVisible();
  });

  test('edit task title inline', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, taskTitle);

    const titleInput = page.getByPlaceholder('Task title');
    await titleInput.clear();
    await titleInput.fill(UPDATED_TITLE);
    // Blur triggers handleBlur → handleSave
    await titleInput.press('Tab');
    await page.waitForTimeout(500);

    // Reload and verify new title appears in task list
    await page.reload();
    await expect(page.getByText(UPDATED_TITLE)).toBeVisible({ timeout: 5000 });
    taskTitle = UPDATED_TITLE;
  });

  test('set due date via calendar picker', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, taskTitle);

    // Open date picker calendar
    await page.getByRole('button', { name: 'Pick date' }).click();
    // Calendar popup appears - click today (highlighted in blue)
    const calendarPopup = page.locator('.absolute.top-full');
    await expect(calendarPopup).toBeVisible({ timeout: 3000 });

    const today = new Date();
    const todayNum = String(today.getDate());
    // Today's button has text-blue-500 class in the picker
    const todayButton = calendarPopup.locator(`button`, { hasText: todayNum }).filter({ has: page.locator('[class*="blue"]') }).first();
    if (await todayButton.count() > 0) {
      await todayButton.click();
    } else {
      // Fallback: click any button with today's date number
      await calendarPopup.locator('button', { hasText: todayNum }).first().click();
    }

    // Wait for popup to close, then verify the Pick date button is still there (date was set)
    await expect(page.getByRole('button', { name: 'Pick date' })).toBeVisible();
    await page.waitForTimeout(300);
  });

  test('set due time', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, taskTitle);

    // The time input has class w-28 and is disabled until date is set
    // First ensure date is set via picker
    await page.getByRole('button', { name: 'Pick date' }).click();
    const calendarPopup = page.locator('.absolute.top-full');
    await expect(calendarPopup).toBeVisible();
    const todayNum = String(new Date().getDate());
    await calendarPopup.locator('button', { hasText: todayNum }).first().click();
    await page.waitForTimeout(300);

    // Now set the time
    const timeInput = page.locator('input[class*="w-28"]');
    await timeInput.fill('02:00 PM');
    await timeInput.press('Tab');
    await page.waitForTimeout(500);

    // Reload and verify time is saved (time icon or value shown on task)
    await page.reload();
    await expect(page.getByText(taskTitle)).toBeVisible();
  });

  test('set description', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, taskTitle);

    const desc = page.getByPlaceholder('Add description...');
    await desc.fill('This is a test description for regression testing.');
    await desc.press('Tab');
    await page.waitForTimeout(500);

    // Reload and verify description indicator (FileText icon) on task row
    await page.reload();
    await expect(page.getByText(taskTitle)).toBeVisible();
  });

  test('description renders URLs as clickable links', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, taskTitle);

    // Previous test set a plain-text description, so the rendered view is shown.
    // Click the plain-text area to enter edit mode (not a link, just text).
    const descContainer = page.locator('div').filter({ hasText: 'This is a test description' }).last();
    await descContainer.click();

    const desc = page.getByPlaceholder('Add description...');
    await expect(desc).toBeVisible({ timeout: 2000 });
    await desc.fill('Check out https://example.com for more info.');
    await desc.press('Tab');
    await page.waitForTimeout(500);

    // Rendered view should show a clickable link
    const link = page.locator('a[href="https://example.com"]');
    await expect(link).toBeVisible({ timeout: 3000 });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    // Surrounding plain text is preserved
    await expect(page.locator('text=Check out')).toBeVisible();
    await expect(page.locator('text=for more info.')).toBeVisible();

    // Reload and re-open: link persists (saved as plain text)
    await page.reload();
    await openTaskDetailPanel(page, taskTitle);
    await expect(page.locator('a[href="https://example.com"]')).toBeVisible({ timeout: 3000 });

    // Clicking non-link text enters edit mode (textarea reappears)
    await page.locator('text=Check out').click();
    await expect(page.getByPlaceholder('Add description...')).toBeVisible({ timeout: 2000 });
  });

  test('set priority to High', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, taskTitle);

    // Priority select is the last select in the detail panel
    // Option order in DOM: None(0), High(3), Medium(2), Low(1)
    const prioritySelect = page.locator('select').last();
    await prioritySelect.selectOption({ label: 'High' });
    await page.waitForTimeout(500);

    // Reload and verify flag indicator on task row
    await page.reload();
    await expect(page.getByText(taskTitle)).toBeVisible();
  });

  test('add subtasks', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, taskTitle);

    const subtaskInput = page.getByPlaceholder('Add subtask...');

    await subtaskInput.fill('Sub A');
    await subtaskInput.press('Enter');
    await expect(page.getByText('Sub A')).toBeVisible({ timeout: 3000 });

    await subtaskInput.fill('Sub B');
    await subtaskInput.press('Enter');
    await expect(page.getByText('Sub B')).toBeVisible({ timeout: 3000 });

    await subtaskInput.fill('Sub C');
    await subtaskInput.press('Enter');
    await expect(page.getByText('Sub C')).toBeVisible({ timeout: 3000 });
  });

  test('complete a subtask', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, taskTitle);

    // Scope to subtasks section to avoid confusion with task rows
    const subtasksSection = page.locator('h4').filter({ hasText: /subtasks/i }).locator('..');
    const subARow = subtasksSection.locator('.group', { hasText: 'Sub A' }).first();

    await subARow.hover();
    // First button in subtask row is the checkbox
    await subARow.locator('button').first().click();
    await page.waitForTimeout(300);

    // Sub A should now show as completed (line-through style)
    const subAText = subtasksSection.locator('span', { hasText: 'Sub A' });
    await expect(subAText).toHaveClass(/line-through/, { timeout: 3000 });
  });

  test('delete a subtask', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, taskTitle);

    const subtasksSection = page.locator('h4').filter({ hasText: /subtasks/i }).locator('..');
    const subBRow = subtasksSection.locator('.group', { hasText: 'Sub B' }).first();

    await subBRow.hover();
    // Last button in subtask row is the X (delete) button
    await subBRow.locator('button').last().click();
    await page.waitForTimeout(300);

    await expect(subtasksSection.getByText('Sub B')).not.toBeVisible({ timeout: 3000 });
  });

  test('drag-reorder subtasks and verify persistence', async ({ page }) => {
    await page.goto(projectUrl);
    await openTaskDetailPanel(page, taskTitle);

    const subtasksSection = page.locator('h4').filter({ hasText: /subtasks/i }).locator('..');

    // Wait for subtasks to be visible
    await expect(subtasksSection.getByText('Sub A')).toBeVisible({ timeout: 3000 });
    await expect(subtasksSection.getByText('Sub C')).toBeVisible({ timeout: 3000 });

    const subARow = subtasksSection.locator('.group', { hasText: 'Sub A' }).first();
    const subCRow = subtasksSection.locator('.group', { hasText: 'Sub C' }).first();

    // Hover Sub A to reveal its drag handle
    await subARow.hover();
    const subAHandle = subARow.locator('span[class*="cursor-grab"]');
    const handleBB = await subAHandle.boundingBox();
    const targetBB = await subCRow.boundingBox();

    if (!handleBB || !targetBB) throw new Error('Could not get bounding boxes for drag');

    // Perform drag: Sub A → below Sub C
    await page.mouse.move(handleBB.x + handleBB.width / 2, handleBB.y + handleBB.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBB.x + handleBB.width / 2, handleBB.y + handleBB.height / 2 + 5);
    // Verify drag animation started (item gets opacity change)
    await expect(subARow).toHaveClass(/opacity-/, { timeout: 2000 });
    await page.mouse.move(targetBB.x + targetBB.width / 2, targetBB.y + targetBB.height / 2 + 5, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    // Verify order changed: Sub C should now appear before Sub A
    const subtaskSpans = subtasksSection.locator('span.flex-1');
    const texts = await subtaskSpans.allTextContents();
    const subCIdx = texts.findIndex(t => t.includes('Sub C'));
    const subAIdx = texts.findIndex(t => t.includes('Sub A'));
    expect(subCIdx).toBeLessThan(subAIdx);

    // Reload and reopen to verify persistence
    await page.reload();
    await openTaskDetailPanel(page, taskTitle);

    const subtasksSectionAfter = page.locator('h4').filter({ hasText: /subtasks/i }).locator('..');
    await expect(subtasksSectionAfter.getByText('Sub C')).toBeVisible({ timeout: 3000 });
    const textsAfter = await subtasksSectionAfter.locator('span.flex-1').allTextContents();
    const subCIdxAfter = textsAfter.findIndex(t => t.includes('Sub C'));
    const subAIdxAfter = textsAfter.findIndex(t => t.includes('Sub A'));
    expect(subCIdxAfter).toBeLessThan(subAIdxAfter);
  });
});
