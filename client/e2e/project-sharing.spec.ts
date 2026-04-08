import { test, expect } from './fixtures';
import type { APIRequestContext } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'admin123';
const TS = Date.now();
const SHARE_EMAIL = 'share-test@example.com';
const SHARE_DISPLAY = 'Share Test User';
const SHARE_PASSWORD = 'ShareTestUser123!';
const SHARED_PROJECT = `Shared Project ${TS}`;

async function getAdminToken(request: APIRequestContext): Promise<string | null> {
  const res = await request.post('/api/auth/login', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  if (!res.ok()) return null;
  const body = await res.json();
  return body.accessToken ?? body.AccessToken ?? null;
}

async function deleteShareTestUser(request: APIRequestContext, token: string): Promise<void> {
  const res = await request.get('/api/admin/users', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return;
  const users: Array<{ id: string; email: string }> = await res.json();
  const user = users.find(u => u.email === SHARE_EMAIL);
  if (user) {
    await request.delete(`/api/admin/users/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

test.describe('Project Sharing', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    const token = await getAdminToken(request);
    if (!token) return;
    // Clean up any leftover test user from previous runs
    await deleteShareTestUser(request, token);
    // Create fresh test user
    const createRes = await request.post('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` },
      data: { email: SHARE_EMAIL, displayName: SHARE_DISPLAY },
    });
    if (!createRes.ok()) return;
    const { invitationToken } = await createRes.json();
    // Accept invitation to set a password
    await request.post('/api/auth/accept-invitation', {
      data: { token: invitationToken, newPassword: SHARE_PASSWORD },
    });
  });

  test.afterAll(async ({ request }) => {
    const token = await getAdminToken(request);
    if (!token) return;
    await deleteShareTestUser(request, token);
    // Clean up test project if it still exists
    const projectsRes = await request.get('/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (projectsRes.ok()) {
      const projects: Array<{ id: string; name: string }> = await projectsRes.json();
      const proj = projects.find(p => p.name === SHARED_PROJECT);
      if (proj) {
        await request.delete(`/api/projects/${proj.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
  });

  test('Share option appears on private projects', async ({ page }) => {
    const sidebar = page.locator('aside');

    // Create a private project
    await sidebar.getByTitle('New project').click();
    await page.getByPlaceholder('Project name').fill(SHARED_PROJECT);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });

    // Open context menu on the new project
    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: SHARED_PROJECT }).locator('..');
    await projectEntry.hover();
    await projectEntry.locator('button').last().click();

    // Share button should be visible (exact match to avoid matching the "Shared project" indicator icon)
    await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible({ timeout: 3000 });

    // Close context menu by clicking the backdrop overlay
    await page.locator('div.fixed.inset-0.z-50').first().click();
    await page.waitForTimeout(200);
  });

  test('Share modal opens and shows owner', async ({ page }) => {
    const sidebar = page.locator('aside');

    // Open context menu on the shared project
    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: SHARED_PROJECT }).locator('..');
    await projectEntry.hover();
    await projectEntry.locator('button').last().click();

    // Click Share
    await page.getByRole('button', { name: 'Share', exact: true }).click();

    // Modal should be visible with the project name in the heading
    await expect(page.getByText(`Share "${SHARED_PROJECT}"`)).toBeVisible({ timeout: 3000 });

    // Owner should be listed with "Owner" label (no X button)
    await expect(page.getByText('Owner')).toBeVisible({ timeout: 3000 });

    // Share Test User should be in the add dropdown
    const addSelect = page.locator('select');
    await expect(addSelect).toBeVisible();
    await expect(addSelect).toContainText(SHARE_DISPLAY, { timeout: 3000 });

    // Add the user
    await addSelect.selectOption({ label: SHARE_DISPLAY });
    await page.getByRole('button', { name: 'Add' }).click();

    // User should now appear in the members list
    await expect(page.getByText(SHARE_DISPLAY)).toBeVisible({ timeout: 5000 });
    // They should no longer appear in the dropdown (it should be gone or not show SHARE_DISPLAY)
    await expect(page.locator('select').first()).not.toContainText(SHARE_DISPLAY, { timeout: 3000 });

    // Close the modal via X button
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.waitForTimeout(300);
  });

  test('Shared user sees the project in their sidebar', async ({ page, browser }) => {
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    try {
      await page2.goto('/login');
      await page2.getByLabel('Email').fill(SHARE_EMAIL);
      await page2.getByLabel('Password').fill(SHARE_PASSWORD);
      await page2.getByRole('button', { name: /sign in/i }).click();
      await expect(page2).toHaveURL(/\/app/, { timeout: 10000 });

      // The shared project should appear in the sidebar
      const sidebar2 = page2.locator('aside');
      await expect(sidebar2.getByText(SHARED_PROJECT)).toBeVisible({ timeout: 10000 });
    } finally {
      await ctx2.close();
    }
  });

  test('Unshare removes access for the user', async ({ page, browser }) => {
    const sidebar = page.locator('aside');

    // Open Share modal
    const projectEntry = sidebar.locator(`[href*="/app/projects/"]`, { hasText: SHARED_PROJECT }).locator('..');
    await projectEntry.hover();
    await projectEntry.locator('button').last().click();
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByText(`Share "${SHARED_PROJECT}"`)).toBeVisible({ timeout: 3000 });

    // Find and click the remove button for Share Test User
    const removeBtn = page.getByRole('button', { name: `Remove ${SHARE_DISPLAY}` });
    await expect(removeBtn).toBeVisible({ timeout: 5000 });
    await removeBtn.click();

    // Remove button should disappear (user removed from list)
    await expect(removeBtn).not.toBeVisible({ timeout: 5000 });

    // Close modal
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.waitForTimeout(300);

    // Log in as the share test user and verify project is gone
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    try {
      await page2.goto('/login');
      await page2.getByLabel('Email').fill(SHARE_EMAIL);
      await page2.getByLabel('Password').fill(SHARE_PASSWORD);
      await page2.getByRole('button', { name: /sign in/i }).click();
      await expect(page2).toHaveURL(/\/app/, { timeout: 10000 });

      const sidebar2 = page2.locator('aside');
      // Wait a moment for sidebar to load
      await page2.waitForTimeout(2000);
      await expect(sidebar2.getByText(SHARED_PROJECT)).not.toBeVisible();
    } finally {
      await ctx2.close();
    }

    // Cleanup: delete the test project
    await sidebar.locator(`[href*="/app/projects/"]`, { hasText: SHARED_PROJECT }).locator('..').hover();
    page.on('dialog', dialog => dialog.accept());
    await sidebar.locator(`[href*="/app/projects/"]`, { hasText: SHARED_PROJECT }).locator('..').locator('button').last().click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });
  });
});
