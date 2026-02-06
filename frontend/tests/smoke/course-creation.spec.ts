import { test, expect } from '@playwright/test';
import { randomTopic, courseTitle, screenshot, resetScreenshotCounter } from '../helpers';

const topic = randomTopic();
const title = courseTitle(topic);

test.describe('Course Creation Wizard', () => {
  test.beforeAll(() => {
    resetScreenshotCounter();
    console.log(`\n--- Test topic: "${topic}" ---\n--- Course title: "${title}" ---\n`);
  });

  test('01 - dashboard shows Create Course button', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('button:has-text("Create Course")')).toBeVisible();
    await screenshot(page, 'dashboard');
  });

  test('02 - navigate to wizard from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.click('button:has-text("Create Course")');
    await page.waitForURL('**/course/wizard');
    await expect(page.locator('#courseName')).toBeVisible();
    await screenshot(page, 'wizard-form');
  });

  test('03 - full course creation end-to-end', async ({ page }) => {
    // Total budget: 5 approval steps (~30s each max) + final generation (60s max)
    test.setTimeout(210_000);

    // Capture ALL console messages for debugging
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      consoleLogs.push(`[PAGE_ERROR] ${err.message}\n${err.stack}`);
    });

    // Navigate to wizard
    await page.goto('/course/wizard');

    // If there's an active workflow, the form won't show — wait for either form or active state
    const formOrActive = await Promise.race([
      page.locator('#courseName').waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'form' as const),
      page.locator('text=/Review:|Generating|Working on/i').first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'active' as const),
    ]).catch(() => 'timeout' as const);

    if (formOrActive === 'form') {
      // Fresh wizard — fill and start
      await page.fill('#courseName', title);
      await screenshot(page, 'wizard-filled');
      await page.click('button:has-text("Generate Title")');
      console.log('Started new workflow');
    } else if (formOrActive === 'active') {
      console.log('Resuming active workflow');
    } else {
      await screenshot(page, 'wizard-unexpected-state');
      throw new Error('Wizard did not show form or active state within 10s');
    }

    let stepCount = 0;
    const maxSteps = 10;

    while (stepCount < maxSteps) {
      // Wait for either approval, completion, failure, or app crash
      const result = await Promise.race([
        page.locator('button:has-text("Approve & Continue")').waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'approval' as const),
        page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'completed' as const),
        page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'failed' as const),
        page.locator('text=Application error').waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'crashed' as const),
      ]);

      if (result === 'completed') {
        await screenshot(page, `final-completed`);
        console.log(`Course created after ${stepCount} approval steps`);
        break;
      }

      if (result === 'failed') {
        await screenshot(page, `final-failed`);
        console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
        const errorText = await page.locator('text=Something went wrong').textContent().catch(() => 'unknown');
        throw new Error(`Workflow failed: ${errorText}`);
      }

      if (result === 'crashed') {
        await screenshot(page, `final-crashed`);
        console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
        throw new Error('Application crashed with client-side exception');
      }

      // Approval step
      stepCount++;
      const stepHeader = await page.locator('h3:has-text("Review:")').textContent().catch(() => 'unknown');
      console.log(`Step ${stepCount}: ${stepHeader}`);
      await screenshot(page, `step-${stepCount}-review`);

      // For persona steps, click "Select All" if visible
      const selectAll = page.locator('button:has-text("Select All")');
      if (await selectAll.isVisible({ timeout: 500 }).catch(() => false)) {
        await selectAll.click();
        await screenshot(page, `step-${stepCount}-selected-all`);
      }

      // Click approve
      await page.click('button:has-text("Approve & Continue")');
      await page.waitForTimeout(1000);
    }

    // Verify completion
    await expect(page.locator('text=Course Created!')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Open in Editor")')).toBeVisible();
    await screenshot(page, 'course-completed');

    // Dump console logs for reference
    console.log('CONSOLE LOGS:\n' + consoleLogs.slice(-30).join('\n'));
  });
});
