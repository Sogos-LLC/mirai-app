import { test, expect, Page } from '@playwright/test';
import { screenshot, resetScreenshotCounter } from '../helpers';

/**
 * Delete all courses from the dashboard.
 */
async function deleteAllCourses(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);

  for (let round = 0; round < 50; round++) {
    const deleteBtn = page.locator('button[title="Delete course"]').first();
    const isVisible = await deleteBtn.isVisible().catch(() => false);
    if (!isVisible) break;

    page.once('dialog', (dialog) => dialog.accept());
    console.log(`  deleting course ${round + 1}...`);
    await deleteBtn.click();
    await page.waitForTimeout(1_500);
  }

  const remaining = await page.locator('button[title="Delete course"]').count();
  console.log(`  cleanup done — ${remaining} courses remaining`);
}

/**
 * Clear any stale workflow on the wizard page.
 */
async function clearStaleWorkflow(page: Page): Promise<void> {
  console.log('Clearing stale workflow...');
  for (let i = 0; i < 6; i++) {
    const state = await Promise.race([
      page.locator('#topic').waitFor({ state: 'visible', timeout: 5_000 }).then(() => 'form' as const),
      page.locator('button:has-text("Approve")').first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => 'approval' as const),
      page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 5_000 }).then(() => 'completed' as const),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 5_000 }).then(() => 'failed' as const),
      page.locator('.animate-spin').first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => 'processing' as const),
    ]).catch(() => 'empty' as const);

    console.log(`  stale cleanup: detected ${state}`);

    if (state === 'form' || state === 'empty' || state === 'completed' || state === 'failed') {
      return;
    }

    if (state === 'approval') {
      const approveBtn = page.locator('button:has-text("Approve")').first();
      const btnText = await approveBtn.textContent();
      console.log(`  approving stale step: "${btnText}"`);
      await approveBtn.click();
      await Promise.race([
        page.locator('.animate-spin').first().waitFor({ state: 'visible', timeout: 10_000 }),
        page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 10_000 }),
      ]).catch(() => {});
      await page.waitForTimeout(3_000);

      if (btnText?.includes('Export')) {
        await Promise.race([
          page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 600_000 }),
          page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 600_000 }),
        ]).catch(() => {});
      }
      continue;
    }

    if (state === 'processing') {
      console.log('  processing — waiting...');
      await Promise.race([
        page.locator('button:has-text("Approve")').first().waitFor({ state: 'visible', timeout: 300_000 }),
        page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 300_000 }),
        page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 300_000 }),
      ]).catch(() => {});
      continue;
    }
  }
}

test.describe('Web Research Toggle', () => {
  test.beforeAll(() => resetScreenshotCounter());

  test('01 - wizard page shows web research toggle', async ({ page }) => {
    // Clean slate
    await deleteAllCourses(page);

    // Clear any stale wizard workflow
    await page.goto('/course/wizard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);

    const hasForm = await page.locator('#topic').isVisible().catch(() => false);
    if (!hasForm) {
      await clearStaleWorkflow(page);
      await page.goto('/course/wizard');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3_000);
    }

    // Verify the form is visible
    await expect(page.locator('#topic')).toBeVisible({ timeout: 15_000 });

    // Verify the web research toggle exists
    const toggle = page.locator('#webResearch');
    await expect(toggle).toBeAttached();

    // Verify toggle label text
    await expect(page.locator('text=Web Research')).toBeVisible();
    await expect(page.locator('text=enrich analysis with live web data')).toBeVisible();

    // Toggle should be off by default
    const isChecked = await toggle.isChecked();
    expect(isChecked).toBe(false);
    await screenshot(page, 'wizard-toggle-off');

    // Click the toggle on
    await toggle.check({ force: true });
    const isNowChecked = await toggle.isChecked();
    expect(isNowChecked).toBe(true);
    await screenshot(page, 'wizard-toggle-on');

    // Toggle it back off
    await toggle.uncheck({ force: true });
    const isOffAgain = await toggle.isChecked();
    expect(isOffAgain).toBe(false);

    console.log('Web research toggle works correctly');
  });

  test('02 - can start course creation with web research enabled', async ({ page }) => {
    test.setTimeout(300_000);

    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => consoleLogs.push(`[PAGE_ERROR] ${err.message}`));

    // Clean slate
    await deleteAllCourses(page);

    // Navigate to wizard
    await page.goto('/course/wizard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);

    const hasForm = await page.locator('#topic').isVisible().catch(() => false);
    if (!hasForm) {
      await clearStaleWorkflow(page);
      await page.goto('/course/wizard');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3_000);
    }

    await expect(page.locator('#topic')).toBeVisible({ timeout: 15_000 });

    // Fill the form
    await page.fill('#topic', 'Home Brewing Coffee');
    await page.fill('#audience', 'Complete beginners who want to brew better coffee at home');

    // Enable web research
    const toggle = page.locator('#webResearch');
    await toggle.check({ force: true });
    expect(await toggle.isChecked()).toBe(true);

    await screenshot(page, 'wizard-filled-with-web-research');

    // Click Generate Course
    await page.click('button:has-text("Generate Course")');
    console.log('Clicked Generate Course with web research enabled');

    // Wait for transition to processing or approval (proves the request went through)
    const postClick = await Promise.race([
      page.locator('.animate-spin').first().waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'processing' as const),
      page.locator('button:has-text("Approve")').first().waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'approval' as const),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'error' as const),
    ]).catch(() => 'timeout' as const);

    console.log(`Post-click state: ${postClick}`);
    await screenshot(page, `web-research-${postClick}`);

    // The workflow started successfully if we see processing or approval
    expect(postClick).not.toBe('timeout');

    if (postClick === 'error') {
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error('Workflow failed to start with web research enabled');
    }

    // If we get to the approval step, verify it's the analysis step
    if (postClick === 'approval') {
      await expect(page.locator('button:has-text("Approve Analysis")')).toBeVisible({ timeout: 10_000 });
      await screenshot(page, 'web-research-analysis-ready');
      console.log('Analysis step reached with web research — success!');
    } else {
      // Wait for first approval step
      console.log('Waiting for analysis approval step...');
      const result = await Promise.race([
        page.locator('button:has-text("Approve Analysis")').waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'approval' as const),
        page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'failed' as const),
      ]).catch(() => 'timeout' as const);

      console.log(`Analysis step result: ${result}`);
      await screenshot(page, `web-research-analysis-${result}`);

      if (result === 'failed') {
        console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
        throw new Error('Workflow failed before reaching analysis step');
      }
      if (result === 'timeout') {
        console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
        throw new Error('Timed out waiting for analysis step');
      }

      console.log('Analysis step reached with web research — success!');
    }

    // Clean up: delete all courses so account is clean
    // First we need to get past the wizard - just go to dashboard directly
    await deleteAllCourses(page);
    await screenshot(page, 'cleanup-done');

    console.log('CONSOLE LOGS (last 20):\n' + consoleLogs.slice(-20).join('\n'));
  });
});
