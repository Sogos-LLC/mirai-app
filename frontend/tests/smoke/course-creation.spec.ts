import { test, expect } from '@playwright/test';
import { randomTopic, screenshot, resetScreenshotCounter } from '../helpers';

const topic = randomTopic();

// Approval steps in order, with their button labels
const APPROVAL_STEPS = [
  { name: 'analysis', button: 'Approve Analysis' },
  { name: 'outcomes', button: 'Approve Outcomes' },
  { name: 'structure', button: 'Approve Structure' },
  { name: 'lesson', button: 'Approve Lesson' },
  { name: 'export', button: 'Approve & Export' },
];

test.describe('Course Creation Wizard', () => {
  test.beforeAll(() => {
    resetScreenshotCounter();
    console.log(`\n--- Test topic: "${topic}" ---\n`);
  });

  test('01 - dashboard shows Create Course button', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('button:has-text("Create Course")')).toBeVisible();
    await screenshot(page, 'dashboard');
  });

  test('02 - full course creation end-to-end', async ({ page }) => {
    // Budget: ~2min per step × 5 steps + lesson gen time
    test.setTimeout(900_000);

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

    // Wait for the idle form to appear
    let started = false;
    for (let attempt = 1; attempt <= 5 && !started; attempt++) {
      console.log(`Attempt ${attempt}: waiting for wizard form...`);

      const detected = await Promise.race([
        page.locator('#topic').waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'form' as const),
        page.locator('button:has-text("Approve")').first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'approval' as const),
        page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'completed' as const),
        page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'failed' as const),
        page.locator('.animate-spin').first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'processing' as const),
      ]).catch(() => 'empty' as const);

      console.log(`  detected: ${detected}`);
      await screenshot(page, `attempt-${attempt}-${detected}`);

      if (detected === 'form') {
        try {
          await page.fill('#topic', topic, { timeout: 3_000 });
          await page.fill('#audience', 'Beginners with no prior experience', { timeout: 3_000 });
          await screenshot(page, 'wizard-filled');
          await page.click('button:has-text("Generate Course")', { timeout: 3_000 });
          console.log('Started new workflow');
          started = true;
        } catch {
          console.log('  form disappeared — waiting...');
          await page.waitForTimeout(5_000);
        }
      } else if (detected === 'approval') {
        console.log('  found active approval step — will proceed');
        started = true;
      } else if (detected === 'failed') {
        console.log('  stale workflow — refreshing');
        await page.goto('/course/wizard');
        await page.waitForLoadState('domcontentloaded');
      } else if (detected === 'completed') {
        console.log('  previous course completed — navigating back');
        await page.goto('/dashboard');
        await page.click('button:has-text("Create Course")');
        await page.waitForURL('**/course/wizard');
        await page.waitForLoadState('domcontentloaded');
      } else if (detected === 'processing') {
        console.log('  processing — waiting...');
        await page.waitForTimeout(8_000);
      } else {
        console.log('  empty — waiting...');
        await page.waitForTimeout(3_000);
      }
    }

    if (!started) {
      await screenshot(page, 'wizard-could-not-start');
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error('Could not start course creation after 5 attempts');
    }

    // =====================================================================
    // Walk through all 5 approval steps
    // Each step: wait for approval button → screenshot → click approve
    // =====================================================================
    for (const step of APPROVAL_STEPS) {
      console.log(`Waiting for step: ${step.name} (button: "${step.button}")...`);

      // Wait up to 3 minutes for the step's approval button or terminal state
      const result = await Promise.race([
        page.locator(`button:has-text("${step.button}")`).waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'approval' as const),
        page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'completed' as const),
        page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'failed' as const),
        page.locator('text=Application error').waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'crashed' as const),
      ]);

      console.log(`  step ${step.name}: ${result}`);
      await screenshot(page, `step-${step.name}-${result}`);

      if (result === 'failed') {
        console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
        throw new Error(`Workflow failed at step: ${step.name}`);
      }
      if (result === 'crashed') {
        console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
        throw new Error(`Application crashed at step: ${step.name}`);
      }
      if (result === 'completed') {
        console.log('  course completed early — skipping remaining steps');
        break;
      }

      // Click the approval button
      const approveBtn = page.locator(`button:has-text("${step.button}")`);
      await approveBtn.click();
      console.log(`  approved: ${step.name}`);

      // Wait for the button to disappear (transitioning to processing)
      await approveBtn.waitFor({ state: 'hidden', timeout: 10_000 });
      await screenshot(page, `step-${step.name}-approved`);
    }

    // =====================================================================
    // Wait for final completion (after last step approval)
    // =====================================================================
    console.log('Waiting for course completion...');

    const finalResult = await Promise.race([
      page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 600_000 }).then(() => 'completed' as const),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 600_000 }).then(() => 'failed' as const),
    ]).catch(() => 'timeout' as const);

    console.log(`Final result: ${finalResult}`);
    await screenshot(page, `final-${finalResult}`);

    if (finalResult === 'failed') {
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error('Workflow failed during final processing');
    }

    if (finalResult === 'timeout') {
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error('Timed out waiting for course completion');
    }

    // Verify completion
    await expect(page.locator('text=Course Created!')).toBeVisible({ timeout: 5_000 });
    await screenshot(page, 'course-completed');

    // Click Open in Editor to verify the course is accessible
    const editorBtn = page.locator('button:has-text("Open in Editor")');
    if (await editorBtn.isVisible()) {
      await editorBtn.click();
      await page.waitForURL('**/course/*/editor', { timeout: 15_000 });
      await screenshot(page, 'course-editor');
      console.log('Course editor loaded successfully!');
    }

    // Dump last console logs for reference
    console.log('CONSOLE LOGS (last 30):\n' + consoleLogs.slice(-30).join('\n'));
  });
});
