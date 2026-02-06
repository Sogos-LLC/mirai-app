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

  test('02 - full course creation end-to-end', async ({ page }) => {
    // Budget: ~20s per approval step (7 steps) + up to 3min for lesson generation
    test.setTimeout(600_000);

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

    // Wait for the idle form to appear — retry if a stale workflow briefly shows
    let started = false;
    for (let attempt = 1; attempt <= 5 && !started; attempt++) {
      console.log(`Attempt ${attempt}: waiting for wizard form...`);

      const detected = await Promise.race([
        page.locator('#courseName').waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'form' as const),
        page.locator('button:has-text("Approve & Continue")').waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'review' as const),
        page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'completed' as const),
        page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'failed' as const),
        page.locator('.animate-spin').first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'processing' as const),
      ]).catch(() => 'empty' as const);

      console.log(`  detected: ${detected}`);
      await screenshot(page, `attempt-${attempt}-${detected}`);

      if (detected === 'form') {
        try {
          await page.fill('#courseName', title, { timeout: 3_000 });
          await screenshot(page, 'wizard-filled');
          await page.click('button:has-text("Generate Title")', { timeout: 3_000 });
          console.log('Started new workflow');
          started = true;
        } catch {
          // Form disappeared (stale job RESUME) — wait for it to resolve
          console.log('  form disappeared — stale job fired RESUME, waiting...');
          await page.waitForTimeout(5_000);
        }
      } else if (detected === 'review') {
        console.log('  found active review — will proceed to approval loop');
        started = true;
      } else if (detected === 'failed') {
        // Stale workflow marked as failed by backend — refresh page
        console.log('  stale workflow cleaned up — refreshing');
        await page.goto('/course/wizard');
        await page.waitForLoadState('domcontentloaded');
      } else if (detected === 'completed') {
        // Previous course completed — navigate away and back
        console.log('  previous course completed — navigating back');
        await page.goto('/dashboard');
        await page.click('button:has-text("Create Course")');
        await page.waitForURL('**/course/wizard');
        await page.waitForLoadState('domcontentloaded');
      } else if (detected === 'processing') {
        // Wait for stale processing to resolve (backend marks it failed)
        console.log('  stale processing — waiting for backend to clean up...');
        await page.waitForTimeout(8_000);
      } else {
        // Empty card — wait briefly and retry
        console.log('  card empty — waiting...');
        await page.waitForTimeout(3_000);
      }
    }

    if (!started) {
      await screenshot(page, 'wizard-could-not-start');
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error('Could not start course creation after 5 attempts');
    }

    // =====================================================================
    // APPROVAL LOOP — step through each approval until course is complete
    //
    // SLAs per step type:
    //   Title/Outcomes/Personas/Audience/Tone: 20s
    //   Outline (with concept map + quality judge): 60s
    //   Lesson generation → completion: 180s
    //
    // We use :not([disabled]) so the locator only matches ENABLED buttons.
    // During sendingApproval the button is disabled → locator won't match,
    // preventing the next loop iteration from re-clicking the same step.
    // =====================================================================
    let stepCount = 0;
    const maxSteps = 12;
    // Track last approved step header to determine next timeout
    let lastStepHeader = '';

    // Locator that only matches an enabled "Approve & Continue" button
    const enabledApproveBtn = page.locator('button:has-text("Approve & Continue"):not([disabled])');

    while (stepCount < maxSteps) {
      // Timeout depends on what we're waiting for after the last approval:
      // - First step (stepCount=0): 90s to cover CreateCourse + StartWorkflow + title gen
      // - After tone approval: outline gen+concept map+judge (up to 45s)
      // - After outline approval: gap analysis + sequential lesson gen (up to 420s)
      // - Everything else: 20s (AI gen + Temporal/polling overhead)
      let waitTimeout = 20_000;
      if (stepCount === 0) waitTimeout = 90_000;
      else if (lastStepHeader.includes('Outline')) waitTimeout = 420_000;
      else if (lastStepHeader.includes('Tone')) waitTimeout = 45_000;

      const result = await Promise.race([
        enabledApproveBtn.waitFor({ state: 'visible', timeout: waitTimeout }).then(() => 'approval' as const),
        page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: waitTimeout }).then(() => 'completed' as const),
        page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: waitTimeout }).then(() => 'failed' as const),
        page.locator('text=Application error').waitFor({ state: 'visible', timeout: waitTimeout }).then(() => 'crashed' as const),
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
      lastStepHeader = stepHeader ?? '';
      console.log(`Step ${stepCount}: ${stepHeader} (waited up to ${waitTimeout / 1000}s)`);
      await screenshot(page, `step-${stepCount}-review`);

      // For persona steps, click "Select All" if visible
      const selectAll = page.locator('button:has-text("Select All")');
      if (await selectAll.isVisible({ timeout: 500 }).catch(() => false)) {
        await selectAll.click();
        await screenshot(page, `step-${stepCount}-selected-all`);
      }

      // Click approve, then wait for the enabled button to disappear
      // (either disabled during sendingApproval, or fully hidden during processing)
      await enabledApproveBtn.click();
      await enabledApproveBtn.waitFor({ state: 'hidden', timeout: 10_000 });
    }

    // Verify completion
    await expect(page.locator('text=Course Created!')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Open in Editor")')).toBeVisible();
    await screenshot(page, 'course-completed');

    // Dump last console logs for reference
    console.log('CONSOLE LOGS (last 30):\n' + consoleLogs.slice(-30).join('\n'));
  });
});
