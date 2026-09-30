import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const TS = Date.now();
const PROJECT_NAME = `Recurrence End ${TS}`;
const TASK_TITLE = `Bounded Series ${TS}`;

async function openTaskDetailPanel(page: Page, title: string) {
  await page.locator('.group', { hasText: title }).first()
    .locator('span, p').filter({ hasText: title }).first().click();
  await expect(page.getByPlaceholder('Task title')).toBeVisible({ timeout: 5000 });
}

async function deleteProject(page: Page) {
  page.on('dialog', dialog => dialog.accept());
  const entry = page.locator('aside').locator(`[href*="/app/projects/"]`, { hasText: PROJECT_NAME }).locator('..');
  if (await entry.count() > 0) {
    await entry.hover();
    await entry.locator('button').last().click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });
  }
}

test.describe('Recurrence end condition', () => {
  test.afterEach(async ({ page }) => {
    await deleteProject(page);
  });

  test('series ending after N occurrences stops after the last one', async ({ page }) => {
    await page.locator('aside').getByTitle('New project').click();
    await page.getByPlaceholder('Project name').fill(PROJECT_NAME);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });

    const input = page.getByPlaceholder('Add a task...');
    await input.fill(TASK_TITLE);
    await input.press('Enter');
    await expect(page.getByText(TASK_TITLE)).toBeVisible({ timeout: 5000 });

    // Due today, repeat every day
    await openTaskDetailPanel(page, TASK_TITLE);
    await page.getByRole('button', { name: 'Pick date' }).click();
    const calendarPopup = page.locator('.absolute.top-full');
    await calendarPopup.locator('button').filter({ hasText: new RegExp(`^${new Date().getDate()}$`) }).first().click();
    await page.locator('button', { hasText: 'Repeat' }).click();
    await page.getByText('Every day').click();

    const repeatButton = page.locator('button', { hasText: 'Every day' });
    await expect(repeatButton).toBeVisible({ timeout: 3000 });

    // End after 2 occurrences
    await repeatButton.click();
    await page.getByRole('button', { name: /^Ends:/ }).click();
    await page.locator('input[name="recurrence-end"]').nth(2).check();
    await page.getByLabel('Occurrence count').fill('2');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('button', { hasText: 'Every day, 2 times' })).toBeVisible({ timeout: 3000 });

    // Complete both occurrences — the series is then finished and leaves the list
    const taskRow = page.locator('.group', { hasText: TASK_TITLE }).first();
    await taskRow.locator('button').first().click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(TASK_TITLE).first()).toBeVisible({ timeout: 5000 });
    await page.locator('.group', { hasText: TASK_TITLE }).first().locator('button').first().click();
    await expect(page.locator('.group', { hasText: TASK_TITLE })).toHaveCount(0, { timeout: 5000 });
  });
});
