import { test, expect, Page } from '@playwright/test';
import { randomTopic, screenshot, resetScreenshotCounter } from '../helpers';

const topic = randomTopic();

// Approval steps in order, with their button labels and per-step timeouts
// Export step needs longer timeout because QA checks + SCORM export run before the button appears
const APPROVAL_STEPS = [
  { name: 'analysis', button: 'Approve Analysis', timeout: 180_000 },
  { name: 'outcomes', button: 'Approve Outcomes', timeout: 180_000 },
  { name: 'structure', button: 'Approve Structure', timeout: 180_000 },
  { name: 'lesson', button: 'Approve Lesson', timeout: 180_000 },
  { name: 'export', button: 'Approve & Export', timeout: 420_000 },
];

/**
 * Delete all courses from the dashboard. Clicks each delete button (title="Delete course")
 * and accepts the native window.confirm() dialog.
 * Returns when the dashboard shows no more delete buttons.
 */
async function deleteAllCourses(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000); // Let courses load

  for (let round = 0; round < 50; round++) {
    const deleteBtn = page.locator('button[title="Delete course"]').first();
    const isVisible = await deleteBtn.isVisible().catch(() => false);
    if (!isVisible) break;

    // Set up dialog handler BEFORE clicking (window.confirm is synchronous)
    page.once('dialog', (dialog) => dialog.accept());
    console.log(`  deleting course ${round + 1}...`);
    await deleteBtn.click();
    await page.waitForTimeout(1_500); // Let the deletion propagate + query refetch
  }

  const remaining = await page.locator('button[title="Delete course"]').count();
  console.log(`  dashboard cleanup done — ${remaining} courses remaining`);
}

/**
 * Clear any stale workflow by clicking through remaining approval steps.
 * The wizard page auto-resumes active jobs, so we must finish or wait for any
 * leftover workflow before starting a fresh one.
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

    if (state === 'form' || state === 'empty') {
      console.log('  wizard is clean — ready for new workflow');
      return;
    }

    if (state === 'completed') {
      console.log('  old workflow completed — done');
      return;
    }

    if (state === 'failed') {
      console.log('  old workflow failed — done');
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
        console.log('  waiting for stale workflow to finish exporting...');
        await Promise.race([
          page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 600_000 }),
          page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 600_000 }),
        ]).catch(() => {});
      }
      continue;
    }

    if (state === 'processing') {
      console.log('  stale workflow processing — waiting...');
      await Promise.race([
        page.locator('button:has-text("Approve")').first().waitFor({ state: 'visible', timeout: 300_000 }),
        page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 300_000 }),
        page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 300_000 }),
      ]).catch(() => {});
      continue;
    }
  }
}

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
    // Budget: ~2min per step × 5 steps + lesson gen time + cleanup
    test.setTimeout(900_000);

    // Capture console messages for debugging
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      consoleLogs.push(`[PAGE_ERROR] ${err.message}`);
    });

    // =====================================================================
    // Phase 0: Clean slate — delete all existing courses from dashboard
    // =====================================================================
    console.log('Phase 0: Cleaning up dashboard...');
    await deleteAllCourses(page);
    await screenshot(page, 'dashboard-clean');

    // If there's a stale active workflow, clear it via the wizard page
    await page.goto('/course/wizard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);

    const hasStaleApproval = await page.locator('button:has-text("Approve")').first().isVisible().catch(() => false);
    const hasStaleProcessing = await page.locator('.animate-spin').first().isVisible().catch(() => false);
    const hasStaleCompleted = await page.locator('text=Course Created!').isVisible().catch(() => false);
    const hasStaleError = await page.locator('text=Something went wrong').isVisible().catch(() => false);

    if (hasStaleApproval || hasStaleProcessing || hasStaleCompleted || hasStaleError) {
      console.log('Detected stale workflow — clearing...');
      await clearStaleWorkflow(page);
    }

    // Navigate to dashboard → wizard with a clean state
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await screenshot(page, 'dashboard-ready');
    await page.click('button:has-text("Create Course")');
    await page.waitForURL('**/course/wizard');
    await page.waitForLoadState('domcontentloaded');

    // =====================================================================
    // Phase 1: Start a new workflow
    // =====================================================================
    let started = false;
    for (let attempt = 1; attempt <= 8 && !started; attempt++) {
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
          console.log('  clicked Generate Course — waiting for transition...');

          const postClick = await Promise.race([
            page.locator('.animate-spin').first().waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'processing' as const),
            page.locator('button:has-text("Approve")').first().waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'approval' as const),
            page.locator('text=deadline_exceeded').waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'timeout_error' as const),
            page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'error' as const),
          ]).catch(() => 'unknown' as const);

          console.log(`  post-click state: ${postClick}`);
          await screenshot(page, `post-click-${postClick}`);

          if (postClick === 'timeout_error' || postClick === 'error') {
            console.log('  RPC error after click — will retry');
            await page.goto('/course/wizard');
            await page.waitForLoadState('domcontentloaded');
          } else {
            console.log('Started new workflow');
            started = true;
          }
        } catch {
          console.log('  form disappeared — waiting...');
          await page.waitForTimeout(5_000);
        }
      } else if (detected === 'approval') {
        const isFirstStep = await page.locator('button:has-text("Approve Analysis")').isVisible().catch(() => false);
        if (isFirstStep) {
          console.log('  found analysis approval step — will proceed');
          started = true;
        } else {
          console.log('  found stale approval step — clearing...');
          await clearStaleWorkflow(page);
          await page.goto('/dashboard');
          await page.waitForLoadState('domcontentloaded');
          await page.click('button:has-text("Create Course")');
          await page.waitForURL('**/course/wizard');
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(2_000);
        }
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
      throw new Error('Could not start course creation after 8 attempts');
    }

    // =====================================================================
    // Walk through all 5 approval steps
    // Each step: wait for approval button → screenshot → click approve
    // =====================================================================
    for (const step of APPROVAL_STEPS) {
      console.log(`Waiting for step: ${step.name} (button: "${step.button}")...`);

      // Wait for the step's approval button or terminal state
      const stepTimeout = step.timeout;
      console.log(`  timeout: ${stepTimeout / 1000}s`);
      const result = await Promise.race([
        page.locator(`button:has-text("${step.button}")`).waitFor({ state: 'visible', timeout: stepTimeout }).then(() => 'approval' as const),
        page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: stepTimeout }).then(() => 'completed' as const),
        page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: stepTimeout }).then(() => 'failed' as const),
        page.locator('text=Application error').waitFor({ state: 'visible', timeout: stepTimeout }).then(() => 'crashed' as const),
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
