import { test, expect } from './fixtures';

test.describe('Settings', () => {
  test('toggling "Show All Tasks" hides and restores the sidebar item', async ({ page }) => {
    const sidebar = page.locator('aside');
    const allTasksLink = sidebar.getByRole('link', { name: /all tasks/i });

    async function saveAndNavigate() {
      await page.getByRole('button', { name: /save profile/i }).click();
      await expect(page.getByText('Profile updated')).toBeVisible({ timeout: 5000 });
      await page.goto('/app/today');
    }

    // Ensure a known starting state: enable "All Tasks"
    await page.goto('/app/settings');
    const checkbox = page.getByRole('checkbox', { name: /show.*all tasks/i });
    if (!(await checkbox.isChecked())) {
      await checkbox.check();
      await saveAndNavigate();
    } else {
      await page.goto('/app/today');
    }

    // "All Tasks" should be visible in sidebar
    await expect(allTasksLink).toBeVisible();

    // Uncheck to hide "All Tasks"
    await page.goto('/app/settings');
    await checkbox.uncheck();
    await saveAndNavigate();

    // "All Tasks" should be gone from the sidebar
    await expect(allTasksLink).not.toBeVisible();

    // Persist across reload
    await page.reload();
    await expect(allTasksLink).not.toBeVisible();

    // Re-enable
    await page.goto('/app/settings');
    await checkbox.check();
    await saveAndNavigate();

    // "All Tasks" should be back
    await expect(allTasksLink).toBeVisible();
  });
});
