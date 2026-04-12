import { test, expect } from './fixtures';
import type { Page, Locator, APIRequestContext } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'admin123';
const TS = Date.now();

const PA = `FDR A ${TS}`;
const PB = `FDR B ${TS}`;
const PC = `FDR C ${TS}`;
const FOLDER_PREFIX = `FDR F ${TS}`;

const TEST_PROJECT_PREFIX = 'FDR ';
const TEST_FOLDER_PREFIXES = ['FDR F ', 'New Folder'];

type Project = { id: string; name: string; folderId: string | null; isInbox?: boolean };
type Folder = { id: string; name: string; projects: Project[] };

async function apiLogin(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/auth/login', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  return (await res.json()).accessToken;
}

async function cleanup(request: APIRequestContext): Promise<void> {
  const token = await apiLogin(request);
  const auth = { Authorization: `Bearer ${token}` };

  // Delete any test folders (also wipes "New Folder" auto-created by merge drags)
  const foldersRes = await request.get('/api/project-folders', { headers: auth });
  if (foldersRes.ok()) {
    const folders: Folder[] = await foldersRes.json();
    for (const f of folders) {
      if (TEST_FOLDER_PREFIXES.some(p => f.name.startsWith(p))) {
        await request.delete(`/api/project-folders/${f.id}`, { headers: auth });
      }
    }
  }
  // Delete any test projects
  const projRes = await request.get('/api/projects', { headers: auth });
  if (projRes.ok()) {
    const projects: Project[] = await projRes.json();
    for (const p of projects) {
      if (p.name.startsWith(TEST_PROJECT_PREFIX)) {
        await request.delete(`/api/projects/${p.id}`, { headers: auth });
      }
    }
  }
}

async function apiListProjects(request: APIRequestContext): Promise<Project[]> {
  const token = await apiLogin(request);
  const res = await request.get('/api/projects', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok() ? await res.json() : [];
}

async function apiListFolders(request: APIRequestContext): Promise<Folder[]> {
  const token = await apiLogin(request);
  const res = await request.get('/api/project-folders', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok() ? await res.json() : [];
}

async function apiCreateFolder(
  request: APIRequestContext,
  name: string,
  projectIds: string[],
): Promise<Folder> {
  const token = await apiLogin(request);
  const res = await request.post('/api/project-folders', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, projectIds },
  });
  return await res.json();
}

async function createProjectUI(page: Page, name: string): Promise<void> {
  const sidebar = page.locator('aside').last();
  await sidebar.getByTitle('New project').click();
  await page.getByPlaceholder('Project name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });
}

/** Drag `sourceHandle` onto `targetLocator`, optionally holding over the target for
 *  `holdMs` milliseconds before releasing. `targetYRatio` controls where vertically
 *  within the target rect to aim (0 = top, 1 = bottom). `steps` controls how many
 *  intermediate pointer-move events are emitted during the drag (default 8). */
async function performDrag(
  page: Page,
  sourceHandle: Locator,
  targetLocator: Locator,
  opts: { holdMs?: number; targetYRatio?: number; steps?: number } = {},
) {
  const { holdMs = 0, targetYRatio = 0.5, steps = 8 } = opts;
  await targetLocator.scrollIntoViewIfNeeded();
  await sourceHandle.scrollIntoViewIfNeeded();

  const sourceBB = await sourceHandle.boundingBox();
  const targetBB = await targetLocator.boundingBox();
  if (!sourceBB || !targetBB) throw new Error('Could not get bounding boxes for drag');

  const startX = sourceBB.x + sourceBB.width / 2;
  const startY = sourceBB.y + sourceBB.height / 2;
  const endX = targetBB.x + targetBB.width / 2;
  const endY = targetBB.y + targetBB.height * targetYRatio;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Small initial nudge — dnd-kit's pointer sensor needs a minimum movement to engage
  await page.mouse.move(startX, startY + 5);
  await page.mouse.move(endX, endY, { steps });
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  await page.mouse.up();
  // Settle: allow optimistic-update + API mutation round-trip to complete
  await page.waitForTimeout(800);
}

function sidebar(page: Page): Locator {
  return page.locator('aside').last();
}

function projectLink(page: Page, name: string): Locator {
  return sidebar(page).locator('a', { hasText: name }).first();
}

function projectHandle(page: Page, name: string): Locator {
  return projectLink(page, name).locator('..').locator('span[class*="cursor-grab"]').first();
}

test.describe('Folder drag-and-drop', () => {
  test.beforeAll(async ({ request }) => { await cleanup(request); });
  test.beforeEach(async ({ request }) => { await cleanup(request); });
  test.afterAll(async ({ request }) => { await cleanup(request); });

  test('creates folder by dragging one project onto another', async ({ page, request }) => {
    page.on('dialog', d => d.accept());
    await createProjectUI(page, PA);
    await createProjectUI(page, PB);

    await page.goto('/app/today');
    const sb = sidebar(page);
    await expect(sb.getByText(PB)).toBeVisible({ timeout: 5000 });

    // Reveal PA's grip handle
    const paLink = projectLink(page, PA);
    await paLink.hover();
    const handle = projectHandle(page, PA);

    // Drag PA onto the middle of PB and hold past the 1000 ms merge timer
    await performDrag(page, handle, projectLink(page, PB), {
      holdMs: 1200,
      targetYRatio: 0.5,
    });

    // Assert: a new folder containing both projects exists on the backend
    const folders = await apiListFolders(request);
    const newFolder = folders.find(
      f => f.name === 'New Folder' || f.name.startsWith(TEST_PROJECT_PREFIX),
    );
    expect(newFolder, 'expected a new folder to be created by the drag').toBeTruthy();
    const projNames = newFolder!.projects.map(p => p.name).sort();
    expect(projNames).toEqual([PA, PB].sort());

    // And the sidebar UI shows the folder header (wait for SignalR-driven refetch to render it)
    await expect(sb.locator('[data-drag-id^="folder-"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('drag project onto folder header adds it to the folder', async ({ page, request }) => {
    page.on('dialog', d => d.accept());
    await createProjectUI(page, PA);
    await createProjectUI(page, PB);

    // Put PB into a folder via API
    const projects = await apiListProjects(request);
    const pb = projects.find(p => p.name === PB)!;
    const folder = await apiCreateFolder(request, `${FOLDER_PREFIX}`, [pb.id]);

    await page.goto('/app/today');
    const sb = sidebar(page);
    await expect(sb.getByText(FOLDER_PREFIX)).toBeVisible();

    // Drag PA onto the folder header
    const paLink = projectLink(page, PA);
    await paLink.hover();
    const handle = projectHandle(page, PA);
    const folderHeader = sb.locator(`[data-drag-id="folder-${folder.id}"]`);

    await performDrag(page, handle, folderHeader, {
      holdMs: 1200,
      targetYRatio: 0.3, // aim for the header strip, above the children
    });

    // Assert: folder now contains both PA and PB
    const folders = await apiListFolders(request);
    const f = folders.find(x => x.id === folder.id)!;
    const names = f.projects.map(p => p.name).sort();
    expect(names).toEqual([PA, PB].sort());
  });

  test('drag project out of folder back to root', async ({ page, request }) => {
    page.on('dialog', d => d.accept());
    await createProjectUI(page, PA);
    await createProjectUI(page, PB);
    await createProjectUI(page, PC);

    // Put PA and PB into a folder via API; leave PC at root
    const projects = await apiListProjects(request);
    const pa = projects.find(p => p.name === PA)!;
    const pb = projects.find(p => p.name === PB)!;
    const uniqueFolderName = `${FOLDER_PREFIX} out ${Math.random().toString(36).slice(2, 6)}`;
    const folder = await apiCreateFolder(request, uniqueFolderName, [pa.id, pb.id]);

    await page.goto('/app/today');
    const sb = sidebar(page);
    await expect(sb.getByText(uniqueFolderName).first()).toBeVisible();

    // Drag PA (inside folder) down past PC (root-level) — aim well below PC so the
    // final hover target is definitely NOT the folder or PC's middle.
    const paLink = projectLink(page, PA);
    await paLink.hover();
    const handle = projectHandle(page, PA);

    await performDrag(page, handle, projectLink(page, PC), {
      holdMs: 0,
      targetYRatio: 0.99, // very bottom of PC, so drop is at root level outside folder
      steps: 4,            // fast drag — don't give the 1000ms merge timer time to fire
    });

    // Assert: PA is now ungrouped (folderId === null); folder still has PB
    const projectsAfter = await apiListProjects(request);
    const paAfter = projectsAfter.find(p => p.id === pa.id)!;
    expect(paAfter.folderId).toBeNull();

    const folders = await apiListFolders(request);
    const fAfter = folders.find(x => x.id === folder.id);
    expect(fAfter?.projects.map(p => p.id)).toEqual([pb.id]);
  });

  test('delete folder via context menu leaves projects ungrouped', async ({ page, request }) => {
    page.on('dialog', d => d.accept());
    await createProjectUI(page, PA);
    await createProjectUI(page, PB);

    const projects = await apiListProjects(request);
    const pa = projects.find(p => p.name === PA)!;
    const pb = projects.find(p => p.name === PB)!;
    const uniqueFolderName = `${FOLDER_PREFIX} del ${Math.random().toString(36).slice(2, 6)}`;
    const folder = await apiCreateFolder(request, uniqueFolderName, [pa.id, pb.id]);

    await page.goto('/app/today');
    const sb = sidebar(page);
    await expect(sb.getByText(uniqueFolderName).first()).toBeVisible();

    // Hover the folder header to reveal the MoreHorizontal (...) button. The folder
    // wrapper is data-drag-id="folder-{id}"; the header is its first child div. The
    // "..." trigger is the ONLY button at the header level (not inside the inner
    // collapse-toggle button).
    const folderWrapper = sb.locator(`[data-drag-id="folder-${folder.id}"]`);
    const folderHeader = folderWrapper.locator('> div').first();
    await folderHeader.hover();
    // Click the context-menu trigger: it's the absolutely-positioned button with
    // `right-1` at the header level.
    await folderHeader.locator('> button').click();

    // Click "Delete folder" menu item (portaled to body, not inside the sidebar).
    await page.getByRole('button', { name: /delete folder/i }).click();

    // Assert: folder is gone, projects are at root
    await expect(sb.getByText(uniqueFolderName)).toHaveCount(0, { timeout: 5000 });

    const folders = await apiListFolders(request);
    expect(folders.find(x => x.id === folder.id)).toBeUndefined();

    const projectsAfter = await apiListProjects(request);
    const paAfter = projectsAfter.find(p => p.id === pa.id)!;
    const pbAfter = projectsAfter.find(p => p.id === pb.id)!;
    expect(paAfter.folderId).toBeNull();
    expect(pbAfter.folderId).toBeNull();
  });
});
