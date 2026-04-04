import { test, expect } from './fixtures';
import type { APIRequestContext } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'admin123';
const TS = Date.now();
const PLAYWRIGHT_EMAIL = 'playwright@example.com';
const PLAYWRIGHT_DISPLAY = 'Playwright User';
const PLAYWRIGHT_PASSWORD = 'PlaywrightUser123!';
const HOUSEHOLD_NAME = `PW Household ${TS}`;
const SHARED_PROJECT = `Shared Project ${TS}`;

async function getAdminToken(request: APIRequestContext): Promise<string | null> {
  const res = await request.post('/api/auth/login', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  if (!res.ok()) return null;
  const body = await res.json();
  return body.accessToken ?? body.AccessToken ?? null;
}

async function deletePlaywrightUser(request: APIRequestContext, token: string): Promise<void> {
  const usersRes = await request.get('/api/admin/users', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!usersRes.ok()) return;
  const users: Array<{ id: string; email: string }> = await usersRes.json();
  const pwUser = users.find(u => u.email === PLAYWRIGHT_EMAIL);
  if (pwUser) {
    await request.delete(`/api/admin/users/${pwUser.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

test.describe('User Management', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    const token = await getAdminToken(request);
    if (!token) return;
    await deletePlaywrightUser(request, token);
  });

  test.afterAll(async ({ request }) => {
    const token = await getAdminToken(request);
    if (!token) return;

    await deletePlaywrightUser(request, token);

    const householdsRes = await request.get('/api/households', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (householdsRes.ok()) {
      const households: Array<{ id: string; name: string }> = await householdsRes.json();
      const hh = households.find(h => h.name === HOUSEHOLD_NAME);
      if (hh) {
        await request.delete(`/api/households/${hh.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }

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

  test('create user, accept invitation, verify, generate reset link', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());

    await page.goto('/app/admin/users');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Add User' }).click();
    await page.getByPlaceholder('Email').fill(PLAYWRIGHT_EMAIL);
    await page.getByPlaceholder('Display Name').fill(PLAYWRIGHT_DISPLAY);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(500);

    const userRow = page.locator('div', { hasText: PLAYWRIGHT_EMAIL }).first();
    await expect(userRow).toBeVisible({ timeout: 5000 });
    await expect(page.locator('span', { hasText: 'Pending invitation' }).first()).toBeVisible();

    const linkInput = page.locator('input[readonly]').first();
    await expect(linkInput).toBeVisible({ timeout: 3000 });
    const inviteUrl = await linkInput.inputValue();
    expect(inviteUrl).toContain('/accept-invitation');
    expect(inviteUrl).toContain('token=');
  });

  test('accept invitation and verify pending badge removed', async ({ page, browser }) => {
    page.on('dialog', dialog => dialog.accept());

    await page.goto('/app/admin/users');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 5000 });

    // Serial mode guarantees test 1 ran first and created the user with a pending invitation.
    // The invite link input is only shown immediately after creation; click Regenerate to surface it.
    const playwrightUserRow = page.locator('div', { hasText: PLAYWRIGHT_EMAIL }).first();
    await expect(playwrightUserRow).toBeVisible({ timeout: 5000 });
    await playwrightUserRow.getByTitle('Regenerate invitation link').click();

    const linkInput = page.locator('input[readonly]').first();
    await expect(linkInput).toBeVisible({ timeout: 5000 });
    const inviteUrl = await linkInput.inputValue();

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    try {
      await page2.goto(inviteUrl);
      await expect(page2.getByRole('heading', { name: /welcome/i })).toBeVisible({ timeout: 10000 });
      await page2.getByLabel('Password', { exact: true }).fill(PLAYWRIGHT_PASSWORD);
      await page2.getByLabel('Confirm Password').fill(PLAYWRIGHT_PASSWORD);
      await page2.getByRole('button', { name: 'Set Password' }).click();
      await expect(page2).toHaveURL(/\/login/, { timeout: 10000 });
    } finally {
      await ctx2.close();
    }

    await page.reload();
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 5000 });
    const playwrightRow = page.locator('div', { hasText: PLAYWRIGHT_EMAIL }).first();
    await expect(playwrightRow).toBeVisible();
    await expect(playwrightRow.locator('span', { hasText: 'Pending invitation' })).not.toBeVisible();
  });

  test('generate password reset link for user', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());

    await page.goto('/app/admin/users');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({ timeout: 5000 });

    const playwrightRow = page.locator('p', { hasText: PLAYWRIGHT_EMAIL }).locator('..').locator('..');
    await expect(playwrightRow).toBeVisible({ timeout: 5000 });

    const resetBtn = playwrightRow.locator('button[title="Generate password reset link"]');
    await expect(resetBtn).toBeVisible({ timeout: 3000 });
    await resetBtn.click();

    const linkInput = page.locator('input[readonly]').first();
    await expect(linkInput).toBeVisible({ timeout: 3000 });
    const resetUrl = await linkInput.inputValue();
    expect(resetUrl).toContain('/reset-password');
    expect(resetUrl).toContain('token=');

    await page.locator('button', { hasText: 'Dismiss' }).click();
    await expect(linkInput).not.toBeVisible();
  });

  test('create household, add playwright@example.com as member via invite code', async ({ page, browser }) => {
    page.on('dialog', dialog => dialog.accept());

    await page.goto('/app/households');
    await expect(page).toHaveURL(/\/app\/households/);

    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByPlaceholder('e.g. Smith Family').fill(HOUSEHOLD_NAME);
    await page.locator('form').getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/app\/household\//, { timeout: 10000 });

    const codeEl = page.locator('code');
    await expect(codeEl).toBeVisible({ timeout: 5000 });
    const inviteCode = await codeEl.textContent();
    expect(inviteCode).toMatch(/^[A-Z0-9]{8}$/);

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    try {
      await page2.goto('/login');
      await page2.getByLabel('Email').fill(PLAYWRIGHT_EMAIL);
      await page2.getByLabel('Password', { exact: true }).fill(PLAYWRIGHT_PASSWORD);
      await page2.getByRole('button', { name: /sign in/i }).click();
      await expect(page2).toHaveURL(/\/app/, { timeout: 10000 });

      await page2.goto('/app/households');
      await page2.getByRole('button', { name: 'Join' }).click();
      await page2.getByPlaceholder('Enter 8-character code').fill(inviteCode!);
      await page2.locator('form').getByRole('button', { name: 'Join' }).click();
      await expect(page2).toHaveURL(/\/app\/household\//, { timeout: 10000 });
    } finally {
      await ctx2.close();
    }

    await page.reload();
    await expect(page.getByText(PLAYWRIGHT_DISPLAY)).toBeVisible({ timeout: 5000 });
  });

  test('create shared project and assign task to household member', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());

    const sidebar = page.locator('aside');
    await page.goto('/app/households');
    await expect(page).toHaveURL(/\/app\/households/);

    const householdBtn = page.getByRole('button', { name: new RegExp(HOUSEHOLD_NAME) });
    await expect(householdBtn).toBeVisible({ timeout: 5000 });

    // Navigate to a page that renders the full sidebar (projects + new project button)
    await page.goto('/app/today');

    await sidebar.getByTitle('New project').click();
    await page.getByPlaceholder('Project name').fill(SHARED_PROJECT);
    const visibilitySelect = page.locator('select').last();
    if (await visibilitySelect.count() > 0) {
      const options = await visibilitySelect.locator('option').allTextContents();
      const householdOption = options.find(o => o.includes(HOUSEHOLD_NAME));
      if (householdOption) {
        await visibilitySelect.selectOption({ label: householdOption });
      }
    }
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/app\/projects\//, { timeout: 10000 });

    const taskInput = page.getByPlaceholder('Add a task...');
    await taskInput.fill('Assigned Task');
    await taskInput.press('Enter');
    await expect(page.getByText('Assigned Task')).toBeVisible();

    const taskRow = page.locator('.group', { hasText: 'Assigned Task' }).first();
    const bb = await taskRow.boundingBox();
    if (bb) {
      await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height / 2);
    }
    await expect(page.getByPlaceholder('Task title')).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(1000);

    const assignSelect = page.locator('select').filter({
      has: page.locator('option', { hasText: 'Unassigned' }),
    });

    if (await assignSelect.count() > 0) {
      await assignSelect.selectOption({ label: PLAYWRIGHT_DISPLAY });
      await page.waitForTimeout(500);
      await expect(assignSelect).toHaveValue(/.+/);
    }
  });
});
