import { test, expect } from './fixtures';
import type { Browser, BrowserContext, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const TS = Date.now();
const CAL_PROJECT = `Cal Project ${TS}`;
const CAL_TASK = `Cal Task ${TS}`;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

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

test.describe('Calendar', () => {
  test.beforeAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    const sidebar = pg.locator('aside');

    // Create a project for calendar tests
    await sidebar.getByTitle('New project').click();
    await pg.getByPlaceholder('Project name').fill(CAL_PROJECT);
    await pg.getByRole('button', { name: 'Create' }).click();
    await expect(pg).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const { ctx, pg } = await loginAndGetPage(browser);
    const sidebar = pg.locator('aside');
    pg.on('dialog', dialog => dialog.accept());
    const entry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: CAL_PROJECT }).locator('..');
    if (await entry.count() > 0) {
      await entry.hover();
      await entry.locator('button').last().click();
      await pg.getByRole('button', { name: 'Delete' }).click();
      await expect(pg).toHaveURL(/\/app\/today/, { timeout: 10000 });
    }
    await ctx.close();
  });

  test('calendar renders with navigation and view picker', async ({ page }) => {
    await page.goto('/app/calendar');
    await expect(page).toHaveURL(/\/app\/calendar/);

    // View picker button should show current view name
    const viewPickerBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
    await expect(viewPickerBtn).toBeVisible({ timeout: 5000 });

    // "Today" navigation button
    const todayBtn = page.getByRole('button', { name: 'Today' });
    await expect(todayBtn).toBeVisible();

    // Navigation prev/next buttons are icon-only (ChevronLeft/Right SVGs, no text).
    // Verify navigation works: click a chevron button and verify the header month label changes.
    // Header shows "Month YYYY" — grab text before and after navigation
    const headerTitle = page.locator('main h2').first();
    await expect(headerTitle).toBeVisible({ timeout: 5000 });
    const titleBefore = await headerTitle.textContent();

    // Scope to main to avoid matching collapsed sidebar icon buttons
    const navButtons = page.locator('main').locator('button[class*="p-1.5"]');
    await expect(navButtons.first()).toBeVisible();
    await navButtons.first().click(); // click prev
    await page.waitForTimeout(300);
    const titleAfter = await headerTitle.textContent();
    expect(titleAfter).not.toBe(titleBefore); // month changed

    // Click Today to restore
    await todayBtn.click();
    await page.waitForTimeout(200);
  });

  test('switch to Month view and verify today is highlighted', async ({ page }) => {
    await page.goto('/app/calendar');

    // Open view picker and select Month
    const viewPickerBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
    await viewPickerBtn.click();
    await page.getByRole('button', { name: 'Month' }).last().click();

    // Today's cell has a blue circle for the day number
    const todayCircle = page.locator('.bg-blue-600.rounded-full');
    await expect(todayCircle).toBeVisible({ timeout: 5000 });

    // Verify it shows today's day number
    const todayDate = new Date().getDate();
    await expect(todayCircle).toContainText(String(todayDate));
  });

  test('create task on calendar and verify chip appears', async ({ page }) => {
    await page.goto('/app/calendar');

    // Ensure Month view
    const viewPickerBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
    await viewPickerBtn.click();
    await page.getByRole('button', { name: 'Month' }).last().click();
    await page.waitForTimeout(300);

    // Click today's cell (the outer div with cursor-pointer)
    // The cell contains the blue circle; click the cell but not on an existing chip
    const todayCircle = page.locator('.bg-blue-600.rounded-full').first();
    const cellOuterDiv = todayCircle.locator('../../..'); // walk up: number div → tasks div sibling → cell
    // Simpler: click the today cell by finding the droppable container
    // The cell div has class border-b border-r cursor-pointer min-h-[80px]
    const todayCell = page.locator('div[class*="cursor-pointer"][class*="min-h"]').filter({
      has: page.locator('.bg-blue-600.rounded-full'),
    }).first();
    await todayCell.click();

    // "Add task" modal should appear
    const titleInput = page.getByPlaceholder('Task title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.fill(CAL_TASK);

    // Select the calendar project from the project dropdown if present
    const projectSelect = page.locator('select').first();
    if (await projectSelect.count() > 0) {
      const options = await projectSelect.locator('option').allTextContents();
      if (options.some(o => o.includes(CAL_PROJECT))) {
        await projectSelect.selectOption({ label: CAL_PROJECT });
      }
    }

    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(500);

    // Verify task chip appears on today's cell
    await expect(page.locator('div', { hasText: CAL_TASK }).first()).toBeVisible({ timeout: 5000 });
  });

  test('drag task chip to a different calendar date and verify it moved', async ({ page }) => {
    await page.goto('/app/calendar');

    // Ensure Month view
    const viewPickerBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /month|week|day/i }).first();
    await viewPickerBtn.click();
    await page.getByRole('button', { name: 'Month' }).last().click();
    await page.waitForTimeout(300);

    // Find the task chip (has inline border-left style from project color)
    const chip = page.locator('[style*="border-left"]').filter({ hasText: CAL_TASK }).first();
    await expect(chip).toBeVisible({ timeout: 5000 });

    // Find tomorrow's cell
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowNum = String(tomorrow.getDate());

    // Locate tomorrow's day cell — it contains the day number but NOT the blue circle (today only)
    // The cell divs have classes border-b border-r cursor-pointer min-h-[80px]
    const allCells = page.locator('div[class*="cursor-pointer"][class*="min-h"]');
    const cellCount = await allCells.count();

    let tomorrowCellIdx = -1;
    for (let i = 0; i < cellCount; i++) {
      const cell = allCells.nth(i);
      const text = await cell.textContent();
      // Check if this cell contains the tomorrow day number but not the today blue circle
      const hasTomorrowNum = text?.includes(tomorrowNum);
      const hasBlueCircle = await cell.locator('.bg-blue-600.rounded-full').count() > 0;
      if (hasTomorrowNum && !hasBlueCircle) {
        // Verify the number is the day number, not part of task title
        const dayNumDiv = cell.locator('div').filter({ hasText: /^\d+$/ });
        const dayText = await dayNumDiv.first().textContent();
        if (dayText?.trim() === tomorrowNum) {
          tomorrowCellIdx = i;
          break;
        }
      }
    }

    if (tomorrowCellIdx === -1) {
      // Last day of month — tomorrow is in next month, skip drag test
      test.skip();
      return;
    }

    const tomorrowCell = allCells.nth(tomorrowCellIdx);

    // Perform drag: chip → tomorrow's cell
    const chipBB = await chip.boundingBox();
    const tomorrowBB = await tomorrowCell.boundingBox();
    if (!chipBB || !tomorrowBB) throw new Error('Could not get bounding boxes for calendar drag');

    await page.mouse.move(chipBB.x + chipBB.width / 2, chipBB.y + chipBB.height / 2);
    await page.mouse.down();
    await page.mouse.move(chipBB.x + chipBB.width / 2, chipBB.y + chipBB.height / 2 + 5);
    await page.mouse.move(tomorrowBB.x + tomorrowBB.width / 2, tomorrowBB.y + tomorrowBB.height / 2, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    // Verify chip now appears in tomorrow's cell
    await expect(tomorrowCell.locator('[style*="border-left"]').filter({ hasText: CAL_TASK })).toBeVisible({ timeout: 5000 });

    // Verify chip is NOT in today's cell anymore
    const todayCell = page.locator('div[class*="cursor-pointer"][class*="min-h"]').filter({
      has: page.locator('.bg-blue-600.rounded-full'),
    }).first();
    await expect(todayCell.locator('[style*="border-left"]').filter({ hasText: CAL_TASK })).not.toBeVisible();
  });
});
