import { test, expect } from './fixtures';
import type { Page, Locator, APIRequestContext } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'admin123';
const TS = Date.now();
const P1 = `Drag P1 ${TS}`;
const P2 = `Drag P2 ${TS}`;
const P3 = `Drag P3 ${TS}`;
const TASK_PROJECT = `Drag Tasks ${TS}`;

/** Prefixes used by any e2e test spec. Kept here so drag-drop (runs first
 *  alphabetically) can purge orphans from previous failed runs before the
 *  sidebar gets long enough to push targets off-screen. */
const TEST_PROJECT_PREFIXES = [
  'Drag P1 ', 'Drag P2 ', 'Drag P3 ', 'Drag Tasks ',
  'Undo Test ', 'Task Project ', 'Time Input Test ',
  'Task Detail Project ', 'Time Bug Test',
  'Hide Cal Project ', 'HideCalTest',
];

async function deleteAllTestProjects(request: APIRequestContext): Promise<void> {
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
    TEST_PROJECT_PREFIXES.some(prefix => p.name.startsWith(prefix)),
  );
  for (const p of testProjects) {
    await request.delete(`/api/projects/${p.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

async function performDrag(page: Page, sourceHandle: Locator, targetLocator: Locator) {
  // Scroll target into view first, then source, so both are in the viewport before dragging
  await targetLocator.scrollIntoViewIfNeeded();
  await sourceHandle.scrollIntoViewIfNeeded();
  await sourceHandle.hover();
  const sourceBB = await sourceHandle.boundingBox();
  const targetBB = await targetLocator.boundingBox();
  if (!sourceBB || !targetBB) throw new Error('Could not get bounding boxes for drag');

  await page.mouse.move(sourceBB.x + sourceBB.width / 2, sourceBB.y + sourceBB.height / 2);
  await page.mouse.down();
  // Small initial move to trigger drag detection
  await page.mouse.move(sourceBB.x + sourceBB.width / 2, sourceBB.y + sourceBB.height / 2 + 5);
  // Complete drag with many steps so OptimisticSortingPlugin fires intermediate onDragOver events
  await page.mouse.move(targetBB.x + targetBB.width / 2, targetBB.y + targetBB.height / 2, { steps: 30 });
  await page.mouse.up();
  // Let React state updates and API call settle
  await page.waitForTimeout(600);
}

async function getSidebarProjectOrder(page: Page, projectNames: string[]): Promise<number[]> {
  const sidebar = page.locator('aside');
  const allLinks = sidebar.locator('a[href*="/app/projects/"]');
  const texts = await allLinks.allTextContents();
  return projectNames.map(name => texts.findIndex(t => t.includes(name)));
}

async function createProject(page: Page, name: string): Promise<string> {
  const sidebar = page.locator('aside');
  await sidebar.getByTitle('New project').click();
  await page.getByPlaceholder('Project name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
  return page.url();
}

async function deleteProject(page: Page, name: string) {
  const sidebar = page.locator('aside');
  const entry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: name }).locator('..');
  await entry.hover();
  await entry.locator('button').last().click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });
}

test.describe('Drag and Drop', () => {
  test.beforeAll(async ({ request }) => {
    await deleteAllTestProjects(request);
  });

  test.afterAll(async ({ request }) => {
    await deleteAllTestProjects(request);
  });

  test('reorder projects in sidebar while on smart list, verify animation and persistence', async ({ page }) => {
    const sidebar = page.locator('aside');
    page.on('dialog', dialog => dialog.accept());

    // Create 3 projects in order: P1, P2, P3
    await createProject(page, P1);
    await createProject(page, P2);
    await createProject(page, P3);

    // Navigate to Today smart list (smart list active, not a project)
    await page.goto('/app/today');
    await expect(page).toHaveURL(/\/app\/today/);

    // Wait for projects to be rendered in the sidebar before checking order
    await expect(sidebar.getByText(P3)).toBeVisible({ timeout: 5000 });

    // Verify initial order: P1 before P2 before P3
    const initialOrder = await getSidebarProjectOrder(page, [P1, P2, P3]);
    expect(initialOrder[0]).toBeLessThan(initialOrder[1]);
    expect(initialOrder[1]).toBeLessThan(initialOrder[2]);

    // Drag P1 below P3
    const p1Link = sidebar.locator('a', { hasText: P1 });
    const p3Link = sidebar.locator('a', { hasText: P3 });
    const p1Item = p1Link.locator('..');

    // Scroll P3 into view first, then P1, ensuring both are visible before the drag
    await p3Link.scrollIntoViewIfNeeded();
    await p1Link.scrollIntoViewIfNeeded();

    // Hover P1 to reveal grab handle
    await p1Link.hover();
    const p1Handle = p1Item.locator('span[class*="cursor-grab"]');

    // Capture bounding boxes before the drag starts (both elements are in view)
    const p1HandleBB = await p1Handle.boundingBox();
    const p3BB = await p3Link.boundingBox();
    if (!p1HandleBB) throw new Error('No handle bounding box');
    if (!p3BB) throw new Error('P3 bounding box not available — element may be off-screen');

    // Start drag and verify animation (opacity class on dragging item)
    await page.mouse.move(p1HandleBB.x + p1HandleBB.width / 2, p1HandleBB.y + p1HandleBB.height / 2);
    await page.mouse.down();
    await page.mouse.move(p1HandleBB.x + p1HandleBB.width / 2, p1HandleBB.y + p1HandleBB.height / 2 + 10);

    // Verify animation: the dragging item should get an opacity class
    // Use .first() because dnd-kit creates a drag overlay clone alongside the placeholder, both having opacity-50
    await expect(p1Item.first()).toHaveClass(/opacity-/, { timeout: 2000 });

    // Complete the drag to P3's position
    await page.mouse.move(p3BB.x + p3BB.width / 2, p3BB.y + p3BB.height / 2 + 5, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    // Verify new order: P3 should be before P1 now
    const newOrder = await getSidebarProjectOrder(page, [P1, P2, P3]);
    expect(newOrder[2]).toBeLessThan(newOrder[0]); // P3 index < P1 index

    // Reload and verify persistence
    await page.reload();
    await expect(sidebar.getByText(P1)).toBeVisible({ timeout: 5000 });
    const persistedOrder = await getSidebarProjectOrder(page, [P1, P2, P3]);
    expect(persistedOrder[2]).toBeLessThan(persistedOrder[0]);

    // Now test while on a project view: navigate to P2's project
    await sidebar.getByText(P2).click();
    await expect(page).toHaveURL(/\/app\/projects\//);

    // Drag P3 back to above P1 (drag P3 upward)
    const p3LinkUpdated = sidebar.locator('a', { hasText: P3 });
    const p1LinkUpdated = sidebar.locator('a', { hasText: P1 });
    const p3ItemUpdated = p3LinkUpdated.locator('..');

    await p3LinkUpdated.hover();
    const p3HandleUpdated = p3ItemUpdated.locator('span[class*="cursor-grab"]');
    await performDrag(page, p3HandleUpdated, p1LinkUpdated);

    // Verify order changed: dragging P3 down to P1's position moves P1 above P3
    const finalOrder = await getSidebarProjectOrder(page, [P1, P2, P3]);
    expect(finalOrder[0]).toBeLessThanOrEqual(finalOrder[2]);

    // Reload and verify persistence
    await page.reload();
    await expect(sidebar.getByText(P1)).toBeVisible({ timeout: 5000 });
    const finalPersistedOrder = await getSidebarProjectOrder(page, [P1, P2, P3]);
    expect(finalPersistedOrder[0]).toBeLessThanOrEqual(finalPersistedOrder[2]);

    // Cleanup
    for (const name of [P1, P2, P3]) {
      const link = sidebar.locator('a', { hasText: name });
      if (await link.count() > 0) {
        await link.click();
        await deleteProject(page, name);
      }
    }
  });

  test('reorder tasks within a project, verify animation and persistence', async ({ page }) => {
    const sidebar = page.locator('aside');
    page.on('dialog', dialog => dialog.accept());

    const taskProjectUrl = await createProject(page, TASK_PROJECT);

    // Add 3 tasks
    const taskInput = page.getByPlaceholder('Add a task...');
    await taskInput.fill('Task One');
    await taskInput.press('Enter');
    await expect(page.getByText('Task One')).toBeVisible();

    await taskInput.fill('Task Two');
    await taskInput.press('Enter');
    await expect(page.getByText('Task Two')).toBeVisible();

    await taskInput.fill('Task Three');
    await taskInput.press('Enter');
    await expect(page.getByText('Task Three')).toBeVisible();

    // Verify initial order: Task One, Task Two, Task Three (top to bottom)
    const getTaskOrder = async () => {
      const rows = page.locator('.group').filter({ has: page.locator('button') });
      return await rows.allTextContents();
    };

    const initialTexts = await getTaskOrder();
    const oneIdx = initialTexts.findIndex(t => t.includes('Task One'));
    const threeIdx = initialTexts.findIndex(t => t.includes('Task Three'));
    expect(oneIdx).toBeLessThan(threeIdx);

    // Drag Task One below Task Three
    const taskOneRow = page.locator('.group', { hasText: 'Task One' }).first();
    const taskThreeRow = page.locator('.group', { hasText: 'Task Three' }).first();

    await taskOneRow.hover();
    const taskOneHandle = taskOneRow.locator('span[class*="cursor-grab"]');

    // Start drag and verify animation
    const handleBB = await taskOneHandle.boundingBox();
    if (!handleBB) throw new Error('No task handle bounding box');

    await page.mouse.move(handleBB.x + handleBB.width / 2, handleBB.y + handleBB.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBB.x + handleBB.width / 2, handleBB.y + handleBB.height / 2 + 5);

    // Verify dragging animation (opacity class applied)
    await expect(taskOneRow).toHaveClass(/opacity-/, { timeout: 2000 });

    // Complete drag to Task Three
    const targetBB = await taskThreeRow.boundingBox();
    if (!targetBB) throw new Error('No target bounding box');
    await page.mouse.move(targetBB.x + targetBB.width / 2, targetBB.y + targetBB.height / 2 + 5, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    // Verify new order: Task Three before Task One
    const newTexts = await getTaskOrder();
    const newOneIdx = newTexts.findIndex(t => t.includes('Task One'));
    const newThreeIdx = newTexts.findIndex(t => t.includes('Task Three'));
    expect(newThreeIdx).toBeLessThan(newOneIdx);

    // Reload and verify persistence
    await page.reload();
    await expect(page).toHaveURL(/\/app\/projects\//);
    await expect(page.getByText('Task One')).toBeVisible({ timeout: 5000 });
    const persistedTexts = await getTaskOrder();
    const persOneIdx = persistedTexts.findIndex(t => t.includes('Task One'));
    const persThreeIdx = persistedTexts.findIndex(t => t.includes('Task Three'));
    expect(persThreeIdx).toBeLessThan(persOneIdx);

    // Cleanup
    await deleteProject(page, TASK_PROJECT);
  });
});
