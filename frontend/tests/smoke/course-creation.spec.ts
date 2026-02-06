import { test, expect } from '@playwright/test';
import { randomTopic, courseTitle, screenshot, resetScreenshotCounter } from '../helpers';

const topic = randomTopic();
const title = courseTitle(topic);

/**
 * Wait for the wizard page to render any content inside the Card.
 * Returns the detected state: 'form', 'processing', 'review', 'completed', 'failed', or 'empty'.
 */
async function detectWizardState(page: import('@playwright/test').Page, timeout = 20_000) {
  const result = await Promise.race([
    page.locator('#courseName').waitFor({ state: 'visible', timeout }).then(() => 'form' as const),
    page.locator('button:has-text("Approve & Continue")').waitFor({ state: 'visible', timeout }).then(() => 'review' as const),
    page.locator('text=Course Created!').waitFor({ state: 'visible', timeout }).then(() => 'completed' as const),
    page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout }).then(() => 'failed' as const),
    // Catch any processing text (spinner state) — broadened to match all possible messages
    page.locator('text=/Reconnecting|Starting course|Working on|Generating|Generated/i').first()
      .waitFor({ state: 'visible', timeout }).then(() => 'processing' as const),
    // Fallback: any animated spinner means processing
    page.locator('.animate-spin').first()
      .waitFor({ state: 'visible', timeout }).then(() => 'processing' as const),
  ]).catch(() => 'empty' as const);
  return result;
}

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

  test('02 - full course creation end-to-end', async ({ page }) => {
    // Budget: ~30s per approval step (6 steps) + up to 3min for lesson generation
    test.setTimeout(420_000);

    // Capture console messages for debugging
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      consoleLogs.push(`[PAGE_ERROR] ${err.message}`);
    });

    // Navigate to dashboard and click Create Course
    await page.goto('/dashboard');
    await page.click('button:has-text("Create Course")');
    await page.waitForURL('**/course/wizard');
    await page.waitForLoadState('domcontentloaded');

    // Detect the wizard state — handles stale workflows from previous runs
    let wizardState = await detectWizardState(page);
    console.log(`Initial wizard state: ${wizardState}`);
    await screenshot(page, `wizard-state-${wizardState}`);

    // If the Card is empty (all React conditions false — race between idle → processing),
    // refresh the page and retry detection
    if (wizardState === 'empty') {
      console.log('Card content empty — refreshing page and retrying');
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      wizardState = await detectWizardState(page);
      console.log(`Wizard state after refresh: ${wizardState}`);
      await screenshot(page, `wizard-state-after-refresh-${wizardState}`);
    }

    // Handle each possible state
    if (wizardState === 'form') {
      // Idle: fill in the course name and start
      await page.fill('#courseName', title);
      await screenshot(page, 'wizard-filled');
      await page.click('button:has-text("Generate Title")');
      console.log('Started new workflow');
    } else if (wizardState === 'completed') {
      // A previous course already completed — go back to dashboard and start fresh
      console.log('Previous course already completed — starting fresh');
      await page.click('button:has-text("Open in Editor")');
      await page.waitForURL('**/editor');
      await page.goto('/dashboard');
      await page.click('button:has-text("Create Course")');
      await page.waitForURL('**/course/wizard');
      await page.waitForLoadState('domcontentloaded');
      // Now the form should show (no more active job)
      await page.locator('#courseName').waitFor({ state: 'visible', timeout: 10_000 });
      await page.fill('#courseName', title);
      await screenshot(page, 'wizard-filled-fresh');
      await page.click('button:has-text("Generate Title")');
      console.log('Started fresh workflow after completed course');
    } else if (wizardState === 'failed') {
      // A previous workflow failed — refresh to get idle form
      console.log('Previous workflow failed — refreshing to start fresh');
      await page.goto('/course/wizard');
      await page.waitForLoadState('domcontentloaded');
      await page.locator('#courseName').waitFor({ state: 'visible', timeout: 10_000 });
      await page.fill('#courseName', title);
      await screenshot(page, 'wizard-filled-after-failure');
      await page.click('button:has-text("Generate Title")');
      console.log('Started new workflow after previous failure');
    } else if (wizardState === 'processing' || wizardState === 'review') {
      console.log(`Resuming active workflow in state: ${wizardState}`);
    } else {
      await screenshot(page, 'wizard-unexpected');
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error(`Wizard stuck in unexpected empty state after two attempts`);
    }

    // =====================================================================
    // APPROVAL LOOP — step through each approval until course is complete
    // =====================================================================
    let stepCount = 0;
    const maxSteps = 12;

    while (stepCount < maxSteps) {
      // Wait for approval, completion, failure, or crash
      // Use 180s timeout to accommodate lesson generation (can take 2-3 min for many lessons)
      const result = await Promise.race([
        page.locator('button:has-text("Approve & Continue")').waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'approval' as const),
        page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'completed' as const),
        page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'failed' as const),
        page.locator('text=Application error').waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'crashed' as const),
      ]);

      if (result === 'completed') {
        await screenshot(page, 'final-completed');
        console.log(`Course created after ${stepCount} approval steps`);
        break;
      }

      if (result === 'failed') {
        await screenshot(page, 'final-failed');
        console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
        const errorText = await page.locator('text=Something went wrong').textContent().catch(() => 'unknown');
        throw new Error(`Workflow failed: ${errorText}`);
      }

      if (result === 'crashed') {
        await screenshot(page, 'final-crashed');
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

    // Dump last console logs for reference
    console.log('CONSOLE LOGS (last 30):\n' + consoleLogs.slice(-30).join('\n'));
  });
});
