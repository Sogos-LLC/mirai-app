import { test, expect } from '@playwright/test';
import { screenshot, resetScreenshotCounter } from '../helpers';

test.beforeAll(() => resetScreenshotCounter());

test('Login and verify dashboard loads', async ({ page }) => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // If auth is working, we should see the dashboard (not a login page)
  const url = page.url();
  console.log(`Current URL: ${url}`);

  // Take a screenshot to verify visually
  await screenshot(page, 'login-check');

  // Should be on dashboard, not redirected to auth
  expect(url).toContain('/dashboard');

  // Should see the Create Course button (proves we're authenticated)
  await expect(page.locator('button:has-text("Create Course")')).toBeVisible({ timeout: 10_000 });
  await screenshot(page, 'dashboard-authenticated');

  console.log('Auth is working - dashboard loaded successfully');
});
