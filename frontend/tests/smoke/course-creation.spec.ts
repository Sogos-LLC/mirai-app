import { test, expect, Page } from '@playwright/test';
import { randomTopic, screenshot, resetScreenshotCounter } from '../helpers';

const topic = randomTopic();

/**
 * Dismiss any driver.js guided tour overlay if present.
 */
async function dismissTour(page: Page): Promise<void> {
  const overlay = page.locator('.driver-overlay');
  if (await overlay.isVisible({ timeout: 2_000 }).catch(() => false)) {
    console.log('  dismissing guided tour...');
    // Click the close button or press Escape
    const closeBtn = page.locator('.driver-popover-close-btn');
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await overlay.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

/**
 * Delete all courses from the dashboard.
 */
async function deleteAllCourses(page: Page): Promise<void> {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3_000);
  await dismissTour(page);

  for (let round = 0; round < 50; round++) {
    const deleteBtn = page.locator('button[title="Delete course"]').first();
    if (!(await deleteBtn.isVisible().catch(() => false))) break;
    page.once('dialog', (dialog) => dialog.accept());
    console.log(`  deleting course ${round + 1}...`);
    await deleteBtn.click();
    await page.waitForTimeout(1_500);
  }

  const remaining = await page.locator('button[title="Delete course"]').count();
  console.log(`  cleanup done — ${remaining} courses remaining`);
}

/**
 * Wait for the workflow card to reach one of the given states.
 */
async function waitForWorkflowState(
  page: Page,
  states: string[],
  timeout: number,
): Promise<string> {
  const selector = states.map(s => `[data-wizard-state="${s}"]`).join(', ');
  await page.locator(selector).first().waitFor({ state: 'visible', timeout });
  const card = page.locator('[data-wizard-state]');
  return await card.getAttribute('data-wizard-state') ?? 'unknown';
}

test.describe('Course Creation Wizard (4-Step)', () => {
  test.beforeAll(() => {
    resetScreenshotCounter();
    console.log(`\n--- Test topic: "${topic}" ---\n`);
  });

  test('01 - dashboard shows Create Course button', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('button:has-text("Create Course")')).toBeVisible();
    await screenshot(page, 'dashboard');
  });

  test('02 - full course creation end-to-end', async ({ page }) => {
    test.setTimeout(900_000);

    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => consoleLogs.push(`[PAGE_ERROR] ${err.message}`));

    // =================================================================
    // Phase 0: Clean slate
    // =================================================================
    console.log('Phase 0: Cleaning dashboard...');
    await deleteAllCourses(page);
    await dismissTour(page);
    await screenshot(page, 'dashboard-clean');

    // =================================================================
    // Phase 1: Navigate to wizard
    // =================================================================
    console.log('Phase 1: Starting wizard...');
    await page.click('button:has-text("Create Course")');
    await page.waitForURL('**/course/wizard', { timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2_000);
    await dismissTour(page);

    // =================================================================
    // Phase 2: Step 1 — Course Title
    // =================================================================
    console.log('Phase 2: Step 1 — Course Title');
    const titleInput = page.locator('#courseTitle');
    await titleInput.waitFor({ state: 'visible', timeout: 15_000 });
    await titleInput.fill(topic);
    await screenshot(page, 'step1-title');

    // Click Next
    await page.click('button:has-text("Next")');
    console.log('  clicked Next');

    // =================================================================
    // Phase 3: Step 2 — Outcomes (wait for AI generation)
    // =================================================================
    console.log('Phase 3: Step 2 — Outcomes (waiting for AI generation...)');

    // Wait for outcomes textarea to appear (after AI generates them)
    const outcomesArea = page.locator('textarea').first();
    await outcomesArea.waitFor({ state: 'visible', timeout: 120_000 });
    await page.waitForTimeout(1_000);
    await screenshot(page, 'step2-outcomes');

    // Check for suggested title
    const suggestedTitle = page.locator('text=Suggested Title');
    if (await suggestedTitle.isVisible().catch(() => false)) {
      console.log('  AI suggested a title');
    }

    // Click Next
    await page.click('button:has-text("Next")');
    console.log('  clicked Next');

    // =================================================================
    // Phase 4: Step 3 — Teacher & Student (wait for AI generation)
    // =================================================================
    console.log('Phase 4: Step 3 — Teacher & Student (waiting for AI generation...)');

    // Wait for persona cards to appear
    const personaCard = page.locator('text=Teacher').first();
    await personaCard.waitFor({ state: 'visible', timeout: 120_000 });
    await page.waitForTimeout(1_000);
    await screenshot(page, 'step3-personas');

    // Click Next
    await page.click('button:has-text("Next")');
    console.log('  clicked Next');

    // =================================================================
    // Phase 5: Step 4 — Context (optional, just proceed)
    // =================================================================
    console.log('Phase 5: Step 4 — Context');
    await page.waitForTimeout(1_000);
    await screenshot(page, 'step4-context');

    // Click Create Course
    await page.click('button:has-text("Create Course")');
    console.log('  clicked Create Course — starting workflow');

    // =================================================================
    // Phase 6: Workflow — wait for approval or completion
    // =================================================================
    console.log('Phase 6: Waiting for workflow...');

    // Wait for either the Generate Course button, Course Created, or error
    const workflowResult = await Promise.race([
      page.locator('button:has-text("Generate Course")').waitFor({ state: 'visible', timeout: 300_000 }).then(() => 'approval' as const),
      page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 300_000 }).then(() => 'completed' as const),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 300_000 }).then(() => 'failed' as const),
    ]).catch(() => 'timeout' as const);

    console.log(`  workflow result: ${workflowResult}`);
    await screenshot(page, `workflow-${workflowResult}`);

    if (workflowResult === 'failed') {
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error('Workflow failed');
    }
    if (workflowResult === 'timeout') {
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error('Timed out waiting for workflow');
    }

    // Click Generate Course if awaiting approval
    if (workflowResult === 'approval') {
      console.log('  found approval step — clicking Generate Course');
      await screenshot(page, 'review-course-plan');
      await page.click('button:has-text("Generate Course")');
      console.log('  approved — generating course...');
      await screenshot(page, 'approved-generating');
    }

    // =================================================================
    // Phase 7: Wait for completion
    // =================================================================
    console.log('Phase 7: Waiting for completion...');

    const finalResult = await Promise.race([
      page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 600_000 }).then(() => 'completed' as const),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 600_000 }).then(() => 'failed' as const),
    ]).catch(() => 'timeout' as const);

    console.log(`  final result: ${finalResult}`);
    await screenshot(page, `final-${finalResult}`);

    if (finalResult === 'failed') {
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error('Workflow failed during course generation');
    }
    if (finalResult === 'timeout') {
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error('Timed out waiting for course completion');
    }

    await expect(page.locator('text=Course Created!')).toBeVisible();
    await screenshot(page, 'course-completed');

    // =================================================================
    // Phase 8: Open in Editor
    // =================================================================
    console.log('Phase 8: Opening editor...');
    const editorBtn = page.locator('button:has-text("Open in Editor")');
    await editorBtn.click();
    await page.waitForURL('**/course/*/editor', { timeout: 15_000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await screenshot(page, 'editor-loaded');
    console.log('  editor loaded');

    // Dump logs
    console.log('CONSOLE LOGS (last 30):\n' + consoleLogs.slice(-30).join('\n'));
  });
});
