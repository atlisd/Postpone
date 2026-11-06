import { test, expect } from './fixtures';
import type { APIRequestContext } from '@playwright/test';

// Regression: the project list only expands recurrences up to 90 days ahead. For yearly and
// every-3-months series, completing the current occurrence pushed the next one past that window
// and the whole series vanished from the project list.

const TS = Date.now();
const PROJECT_NAME = `Long Interval ${TS}`;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function apiToken(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/auth/login', {
    data: {
      email: process.env.TEST_EMAIL ?? 'admin@example.com',
      password: process.env.TEST_PASSWORD ?? 'admin123',
    },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).accessToken;
}

let projectId = '';
let token = '';

test.describe.configure({ mode: 'serial' });

test.describe('Long-interval recurrence', () => {
  test.beforeAll(async ({ request }) => {
    token = await apiToken(request);
    const res = await request.post('/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: PROJECT_NAME },
    });
    expect(res.ok()).toBeTruthy();
    projectId = (await res.json()).id;
  });

  test.afterAll(async ({ request }) => {
    if (projectId) {
      await request.delete(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
    }
  });

  for (const [label, rrule] of [['yearly', 'FREQ=YEARLY'], ['every 3 months', 'FREQ=MONTHLY;INTERVAL=3']]) {
    test(`${label} task stays in project list after completing`, async ({ page, request }) => {
      const title = `Birthday ${label} ${TS}`;
      const headers = { Authorization: `Bearer ${token}` };

      const created = await request.post(`/api/projects/${projectId}/tasks`, {
        headers,
        data: { title, dueDate: today() },
      });
      expect(created.ok()).toBeTruthy();
      const taskId = (await created.json()).id;
      const recur = await request.put(`/api/tasks/${taskId}/recurrence`, { headers, data: { rrule } });
      expect(recur.ok()).toBeTruthy();

      await page.goto(`/app/projects/${projectId}`);
      const row = page.locator('.group', { hasText: title }).first();
      await expect(row).toBeVisible({ timeout: 5000 });

      const completed = page.waitForResponse(r => r.url().includes(`/api/tasks/${taskId}`) && r.request().method() !== 'GET');
      await row.locator('button').first().click();
      await completed;

      // Next occurrence (beyond the 90-day window) must still be listed after a fresh load.
      await page.reload();
      await expect(page.locator('.group', { hasText: title }).first()).toBeVisible({ timeout: 5000 });

      const list = await request.get(`/api/projects/${projectId}/tasks`, { headers });
      const open = (await list.json()).filter((t: { id: string; completedAt: string | null }) => t.id === taskId && !t.completedAt);
      expect(open).toHaveLength(1);
      expect(open[0].dueDate > today()).toBeTruthy();
    });
  }
});
