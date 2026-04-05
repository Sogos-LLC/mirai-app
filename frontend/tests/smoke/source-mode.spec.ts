import { test, expect, Page } from '@playwright/test';
import { screenshot, resetScreenshotCounter } from '../helpers';

const TOPIC = 'Basic Composting at Home';

/**
 * Delete all courses from the dashboard.
 */
async function deleteAllCourses(page: Page): Promise<void> {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3_000);

  for (let round = 0; round < 50; round++) {
    const deleteBtn = page.locator('button[title="Delete course"]').first();
    if (!(await deleteBtn.isVisible().catch(() => false))) break;
    page.once('dialog', (dialog) => dialog.accept());
    console.log(`  deleting course ${round + 1}...`);
    await deleteBtn.click();
    await page.waitForTimeout(1_500);
  }
  console.log(`  cleanup done — ${await page.locator('button[title="Delete course"]').count()} remaining`);
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

test.describe('Source Mode & Provenance', () => {
  test.beforeAll(() => {
    resetScreenshotCounter();
  });

  test('create course with web research, then verify source mode UI', async ({ page }) => {
    test.setTimeout(900_000);

    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => consoleLogs.push(`[PAGE_ERROR] ${err.message}`));

    // =================================================================
    // Phase 0: Clean slate
    // =================================================================
    console.log('Phase 0: Cleaning dashboard...');
    await deleteAllCourses(page);
    await screenshot(page, 'dashboard-clean');

    // =================================================================
    // Phase 1: Create course via 4-step wizard
    // =================================================================
    console.log('Phase 1: Creating course...');
    await page.click('button:has-text("Create Course")');
    await page.waitForURL('**/course/wizard', { timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2_000);

    // Step 1: Title
    const titleInput = page.locator('#courseTitle');
    await titleInput.waitFor({ state: 'visible', timeout: 15_000 });
    await titleInput.fill(TOPIC);
    await page.click('button:has-text("Next")');

    // Step 2: Outcomes (wait for AI generation)
    console.log('  waiting for outcomes...');
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 120_000 });
    await page.waitForTimeout(1_000);
    await page.click('button:has-text("Next")');

    // Step 3: Teacher & Student (wait for AI generation)
    console.log('  waiting for personas...');
    await page.locator('text=Teacher').first().waitFor({ state: 'visible', timeout: 120_000 });
    await page.waitForTimeout(1_000);
    await page.click('button:has-text("Next")');

    // Step 4: Context — just proceed
    await page.waitForTimeout(1_000);
    await screenshot(page, 'wizard-form-filled');

    // Submit
    await page.click('button:has-text("Create Course")');
    console.log('  clicked Create Course');

    // =================================================================
    // Phase 2: Approve the single review step
    // =================================================================
    console.log('Phase 2: Waiting for approval step...');

    // Wait for workflow phase
    let state = await waitForWorkflowState(
      page,
      ['awaiting-approval', 'completed', 'failed', 'processing'],
      120_000,
    );

    if (state === 'processing') {
      state = await waitForWorkflowState(
        page,
        ['awaiting-approval', 'completed', 'failed'],
        300_000,
      );
    }

    console.log(`  state: ${state}`);
    await screenshot(page, `wizard-${state}`);
    if (state === 'failed') throw new Error('Workflow failed');

    if (state === 'awaiting-approval') {
      const approveBtn = page.locator('button:has-text("Generate Course")');
      await approveBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await approveBtn.click();
      console.log('  approved — generating course...');
    }

    // Wait for completion
    console.log('  waiting for completion...');
    const finalResult = await Promise.race([
      page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 600_000 }).then(() => 'completed' as const),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 600_000 }).then(() => 'failed' as const),
    ]).catch(() => 'timeout' as const);

    console.log(`  final: ${finalResult}`);
    await screenshot(page, `wizard-final-${finalResult}`);
    if (finalResult !== 'completed') throw new Error(`Course creation ended: ${finalResult}`);

    // =================================================================
    // Phase 3: Open in editor
    // =================================================================
    console.log('Phase 3: Opening editor...');
    await page.locator('button:has-text("Open in Editor")').click();
    await page.waitForURL('**/course/*/editor', { timeout: 15_000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await screenshot(page, 'editor-loaded');

    // =================================================================
    // Phase 4: Verify Sources button and Grounded badge
    // =================================================================
    console.log('Phase 4: Checking source mode elements...');

    const sourcesBtn = page.locator('button[title="Toggle source attribution view"]');
    await sourcesBtn.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('  Sources button: visible');

    const groundedBadge = page.locator('button:has-text("% grounded")');
    const hasGroundedBadge = await groundedBadge.isVisible().catch(() => false);
    console.log(`  Grounded badge: ${hasGroundedBadge}`);
    if (hasGroundedBadge) {
      console.log(`  Grounded text: "${await groundedBadge.textContent()}"`);
    }

    await screenshot(page, 'editor-before-sources');

    // =================================================================
    // Phase 5: Toggle Source Mode ON
    // =================================================================
    console.log('Phase 5: Enabling source mode...');
    await sourcesBtn.click();
    await expect(page.locator('[data-source-mode="on"]')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1_000);
    await screenshot(page, 'source-mode-on');

    // Verify summary bar
    const summaryBar = page.locator('text=Source Distribution');
    const hasSummaryBar = await summaryBar.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(`  Summary bar: ${hasSummaryBar}`);
    expect(hasSummaryBar).toBe(true);

    // Source type badges
    const aiCount = await page.locator('button:has-text("AI Generated")').count();
    const webCount = await page.locator('button:has-text("Web Search")').count();
    const internalCount = await page.locator('button:has-text("Internal Knowledge")').count();
    console.log(`  Badges — AI: ${aiCount}, Web: ${webCount}, Internal: ${internalCount}`);
    expect(aiCount + webCount + internalCount).toBeGreaterThan(0);

    await screenshot(page, 'source-mode-badges');

    // =================================================================
    // Phase 6: ProvenancePanel via grounded badge
    // =================================================================
    if (hasGroundedBadge) {
      console.log('Phase 6: ProvenancePanel...');
      await groundedBadge.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'provenance-panel');

      const hasAttribution = await page.locator('text=Knowledge Source Attribution').isVisible({ timeout: 3_000 }).catch(() => false);
      console.log(`  Attribution panel: ${hasAttribution}`);

      const hasCitations = await page.locator('text=Source Citations').isVisible().catch(() => false);
      console.log(`  Source Citations: ${hasCitations}`);

      await screenshot(page, 'provenance-detail');
      await groundedBadge.click(); // close
      await page.waitForTimeout(300);
    }

    // =================================================================
    // Phase 7: SourceDetailPopover via component badge
    // =================================================================
    console.log('Phase 7: SourceDetailPopover...');
    const badgeToClick = webCount > 0
      ? page.locator('button:has-text("Web Search")').first()
      : page.locator('button:has-text("AI Generated")').first();
    await badgeToClick.click();
    await page.waitForTimeout(500);
    await screenshot(page, 'source-detail-popover');

    const hasDetail = await page.locator('text=Source Details').isVisible({ timeout: 3_000 }).catch(() => false);
    console.log(`  Popover visible: ${hasDetail}`);
    await screenshot(page, 'source-detail-content');

    // =================================================================
    // Phase 8: Toggle OFF
    // =================================================================
    console.log('Phase 8: Source mode off...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await sourcesBtn.click();
    await expect(page.locator('[data-source-mode="off"]')).toBeVisible({ timeout: 5_000 });
    expect(await summaryBar.isVisible().catch(() => false)).toBe(false);
    await screenshot(page, 'source-mode-off');

    // =================================================================
    // Summary
    // =================================================================
    console.log('\n=== SUMMARY ===');
    console.log(`Badges: AI=${aiCount}, Web=${webCount}, Internal=${internalCount}`);
    console.log(`Grounded badge: ${hasGroundedBadge}`);
    console.log(`Summary bar: ${hasSummaryBar}`);
    console.log('===============\n');
    console.log('CONSOLE LOGS (last 20):\n' + consoleLogs.slice(-20).join('\n'));
  });
});
