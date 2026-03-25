import { test as base, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPassword123!';

export const test = base.extend<{ authenticatedPage: ReturnType<typeof base['extend']> }>({
  page: async ({ page }, use) => {
    // Log in before each test
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app/, { timeout: 10000 });
    await use(page);
  },
});

export { expect };
