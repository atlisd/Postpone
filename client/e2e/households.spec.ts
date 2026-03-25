import { test, expect } from './fixtures';

const HOUSEHOLD_NAME = `Test Household ${Date.now()}`;

test.describe('Households', () => {
  test('create, view, and delete a household', async ({ page }) => {
    // Navigate to households via sidebar
    const sidebar = page.locator('aside');
    await sidebar.getByText('Households').click();
    await expect(page).toHaveURL(/\/app\/households/);

    // Create
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByPlaceholder('e.g. Smith Family').fill(HOUSEHOLD_NAME);
    await page.locator('form').getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(/\/app\/household\//, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: HOUSEHOLD_NAME })).toBeVisible();

    // Verify invite code
    await expect(page.getByText('Invite Code')).toBeVisible();
    const code = page.locator('code');
    await expect(code).toBeVisible();
    await expect(code).toHaveText(/^[A-Z0-9]{8}$/);

    // Go back to list via sidebar and verify
    await sidebar.getByText('Households').click();
    await expect(page).toHaveURL(/\/app\/households/);
    const householdButton = page.getByRole('button', { name: new RegExp(HOUSEHOLD_NAME) });
    await expect(householdButton).toBeVisible();

    // Delete
    await householdButton.click();
    await expect(page).toHaveURL(/\/app\/household\//);

    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /delete household/i }).click();
    await expect(page).toHaveURL(/\/app\/today/, { timeout: 10000 });

    // Verify gone
    await sidebar.getByText('Households').click();
    await expect(householdButton).not.toBeVisible();
  });
});
