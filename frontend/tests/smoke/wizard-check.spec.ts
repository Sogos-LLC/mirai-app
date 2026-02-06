import { test } from '@playwright/test';
import { screenshot, resetScreenshotCounter } from '../helpers';

test.beforeAll(() => resetScreenshotCounter());

test('Screenshot the wizard page', async ({ page }) => {
  await page.goto('/course/wizard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await screenshot(page, 'wizard-page');
});
