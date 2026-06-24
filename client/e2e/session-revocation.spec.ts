import { test, expect } from './fixtures';

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'admin123';
const TEMP_PASSWORD = 'TempRevoke999!';

test.describe('Session revocation on password change', () => {
  // Restore original password if the test fails mid-way
  test.afterEach(async ({ request }) => {
    await request.post('/api/auth/login', {
      data: { email: TEST_EMAIL, password: TEMP_PASSWORD },
    }).then(async (res) => {
      if (!res.ok()) return;
      const { accessToken } = await res.json();
      await request.put('/api/auth/me/password', {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { currentPassword: TEMP_PASSWORD, newPassword: TEST_PASSWORD },
      });
    }).catch(() => {});
  });

  test('changing password revokes all other active sessions', async ({ page, browser }) => {
    // Session B: a second independent context simulating another device / attacker session
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();

    try {
      // Log session B in before the password change
      await pageB.goto('/login');
      await pageB.getByLabel('Email').fill(TEST_EMAIL);
      await pageB.getByLabel('Password').fill(TEST_PASSWORD);
      await pageB.getByRole('button', { name: /sign in/i }).click();
      await expect(pageB).toHaveURL(/\/app/, { timeout: 10000 });

      // Confirm session B can refresh its token (healthy session)
      const beforeRefresh = await pageB.evaluate(() =>
        fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
          .then(r => r.status)
      );
      expect(beforeRefresh).toBe(200);

      // Session A (the fixture page) changes the password via the settings UI
      await page.goto('/app/settings');
      // Labels in SettingsPage lack for/id associations; scope to the change-password form
      const pwForm = page.locator('form', {
        has: page.getByRole('button', { name: 'Change password' }),
      });
      await pwForm.locator('input[type="password"]').nth(0).fill(TEST_PASSWORD);
      await pwForm.locator('input[type="password"]').nth(1).fill(TEMP_PASSWORD);
      await pwForm.locator('input[type="password"]').nth(2).fill(TEMP_PASSWORD);
      await pwForm.getByRole('button', { name: 'Change password' }).click();
      await expect(page.getByText('Password changed')).toBeVisible({ timeout: 5000 });

      // Session B's refresh token must now be revoked
      const afterRefresh = await pageB.evaluate(() =>
        fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
          .then(r => r.status)
      );
      expect(afterRefresh).toBe(401);

      // Restore password so other tests and afterEach don't need to
      const loginRes = await pageB.evaluate(
        ({ email, tempPw, origPw }) =>
          fetch('/api/auth/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: tempPw }),
          })
            .then(r => r.json())
            .then(body =>
              fetch('/api/auth/me/password', {
                method: 'PUT',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${body.accessToken}`,
                },
                body: JSON.stringify({ currentPassword: tempPw, newPassword: origPw }),
              }).then(r => r.status)
            ),
        { email: TEST_EMAIL, tempPw: TEMP_PASSWORD, origPw: TEST_PASSWORD }
      );
      expect(loginRes).toBe(204);
    } finally {
      await ctxB.close();
    }
  });
});
