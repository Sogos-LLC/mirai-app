import { test, expect, Page } from '@playwright/test';
import { screenshot, resetScreenshotCounter } from '../helpers';

const TOPIC = 'Basic Composting at Home';
const AUDIENCE = 'Beginners with no prior experience';

/**
 * Delete all courses from the dashboard.
 */
async function deleteAllCourses(page: Page): Promise<void> {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForResponse(
      (resp) => resp.url().includes('ListCourses') && resp.status() === 200,
      { timeout: 15_000 },
    );
  } catch { /* may already have loaded */ }
  await page.waitForTimeout(2_000);

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
 * Wait for the wizard card to reach one of the given states using data-wizard-state.
 * Returns the matched state string.
 */
async function waitForWizardState(
  page: Page,
  states: string[],
  timeout: number,
): Promise<string> {
  const card = page.locator('[data-wizard-state]');
  const selector = states.map(s => `[data-wizard-state="${s}"]`).join(', ');

  await page.locator(selector).first().waitFor({ state: 'visible', timeout });
  return await card.getAttribute('data-wizard-state') ?? 'unknown';
}

/**
 * Clear any stale wizard workflow by approving through remaining steps.
 */
async function clearStaleWorkflow(page: Page): Promise<void> {
  console.log('Clearing stale workflow...');
  for (let i = 0; i < 8; i++) {
    const state = await waitForWizardState(
      page,
      ['idle', 'awaiting-approval', 'completed', 'failed', 'processing'],
      10_000,
    ).catch(() => 'unknown');

    console.log(`  stale cleanup: ${state}`);
    if (state === 'idle' || state === 'completed' || state === 'failed' || state === 'unknown') return;

    if (state === 'awaiting-approval') {
      const approveBtn = page.locator('button:has-text("Approve")').first();
      if (await approveBtn.isVisible().catch(() => false)) {
        const text = await approveBtn.textContent();
        console.log(`  approving: "${text}"`);
        await approveBtn.click();
        // Wait for transition out of awaiting-approval
        await waitForWizardState(page, ['processing', 'completed', 'failed', 'awaiting-approval'], 300_000).catch(() => {});
        await page.waitForTimeout(2_000);
      }
    } else if (state === 'processing') {
      console.log('  waiting for processing to finish...');
      await waitForWizardState(page, ['awaiting-approval', 'completed', 'failed'], 300_000).catch(() => {});
    }
  }
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

    // Clear any stale wizard workflow
    await page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);
    const wizardCard = page.locator('[data-wizard-state]');
    const initialState = await wizardCard.getAttribute('data-wizard-state').catch(() => null);
    if (initialState && initialState !== 'idle') {
      await clearStaleWorkflow(page);
    }

    // =================================================================
    // Phase 1: Create course with Web Research ON
    // =================================================================
    console.log('Phase 1: Creating course with web research...');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_000);
    await page.click('button:has-text("Create Course")');
    await page.waitForURL('**/course/wizard', { timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded');

    // Wait for idle state (form ready)
    await waitForWizardState(page, ['idle'], 15_000).catch(async () => {
      // If not idle, clear stale and retry
      await clearStaleWorkflow(page);
      await page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
      await waitForWizardState(page, ['idle'], 15_000);
    });

    // Fill form
    await page.fill('#topic', TOPIC);
    await page.fill('#audience', AUDIENCE);

    // Enable Web Research toggle
    if (!(await page.locator('#webResearch').isChecked())) {
      await page.locator('label[for="webResearch"]').click();
      console.log('  enabled web research toggle');
    }
    await screenshot(page, 'wizard-form-filled');

    // Submit
    await page.click('button:has-text("Generate Course")');
    console.log('  clicked Generate Course');

    // Wait for processing to start
    const postClick = await waitForWizardState(
      page, ['processing', 'awaiting-approval', 'failed'], 90_000,
    );
    console.log(`  post-click: ${postClick}`);
    await screenshot(page, `wizard-${postClick}`);
    if (postClick === 'failed') throw new Error('Workflow failed to start');

    // =================================================================
    // Phase 2: Approve all 5 steps using data-wizard-state signals
    // =================================================================
    console.log('Phase 2: Approving steps...');

    const STEPS = [
      { label: 'Approve Analysis', timeout: 300_000 },
      { label: 'Approve Outcomes', timeout: 180_000 },
      { label: 'Approve Structure', timeout: 180_000 },
      { label: 'Approve Lesson', timeout: 300_000 },
      { label: 'Approve & Export', timeout: 420_000 },
    ];

    for (const step of STEPS) {
      // Wait for awaiting-approval or terminal state
      const state = await waitForWizardState(
        page, ['awaiting-approval', 'completed', 'failed'], step.timeout,
      );
      console.log(`  ${step.label}: state=${state}`);

      const wizardStep = await page.locator('[data-wizard-state]').getAttribute('data-wizard-step') ?? '';
      const progress = await page.locator('[data-wizard-state]').getAttribute('data-wizard-progress') ?? '0';
      console.log(`  step=${wizardStep}, progress=${progress}%`);

      await screenshot(page, `step-${step.label.toLowerCase().replace(/\s+/g, '-')}`);

      if (state === 'completed') { console.log('  completed early'); break; }
      if (state === 'failed') throw new Error(`Workflow failed at: ${step.label}`);

      // Click approve
      const btn = page.locator(`button:has-text("${step.label}")`);
      await btn.waitFor({ state: 'visible', timeout: 5_000 });
      await btn.click();
      console.log(`  approved: ${step.label}`);

      // Wait for transition to processing or next state
      await waitForWizardState(
        page, ['processing', 'awaiting-approval', 'completed', 'failed'], 30_000,
      ).catch(() => {});
    }

    // Wait for final completion
    console.log('  waiting for completion...');
    const final = await waitForWizardState(page, ['completed', 'failed'], 600_000);
    console.log(`  final: ${final}`);
    await screenshot(page, `wizard-final-${final}`);
    if (final !== 'completed') throw new Error(`Course creation ended: ${final}`);

    // =================================================================
    // Phase 3: Open in editor
    // =================================================================
    console.log('Phase 3: Opening editor...');
    await page.locator('button:has-text("Open in Editor")').click();
    await page.waitForURL('**/course/*/editor', { timeout: 15_000 });
    await page.waitForLoadState('domcontentloaded');

    // Wait for lesson to load using data-editor-state signal
    await expect(page.locator('[data-editor-state="lesson-loaded"]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2_000);
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

    const hasProvenance = await page.locator('[data-has-provenance="true"]').isVisible().catch(() => false);
    console.log(`  Has provenance data: ${hasProvenance}`);

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

    // Grounded % in summary
    const groundedText = page.locator('text=/\\d+% grounded/').first();
    if (await groundedText.isVisible().catch(() => false)) {
      console.log(`  Grounded: "${await groundedText.textContent()}"`);
    }

    // Source type badges
    const aiCount = await page.locator('button:has-text("AI Generated")').count();
    const webCount = await page.locator('button:has-text("Web Search")').count();
    const internalCount = await page.locator('button:has-text("Internal Knowledge")').count();
    console.log(`  Badges — AI: ${aiCount}, Web: ${webCount}, Internal: ${internalCount}`);
    expect(aiCount + webCount + internalCount).toBeGreaterThan(0);

    // Legend
    const hasLegendAI = await page.locator('text=/AI \\(\\d+\\)/').isVisible().catch(() => false);
    const hasLegendWeb = await page.locator('text=/Web \\(\\d+\\)/').isVisible().catch(() => false);
    console.log(`  Legend — AI: ${hasLegendAI}, Web: ${hasLegendWeb}`);

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

      if (hasCitations) {
        const pctBadges = page.locator('.bg-surface.rounded.border >> text=/\\d+%/');
        const pctCount = await pctBadges.count();
        console.log(`  Citation % badges: ${pctCount}`);
        for (let i = 0; i < Math.min(pctCount, 5); i++) {
          console.log(`    [${i}]: ${await pctBadges.nth(i).textContent()}`);
        }
        const excerpts = page.locator('.line-clamp-2');
        console.log(`  Excerpt elements: ${await excerpts.count()}`);
      }

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

    if (hasDetail) {
      const links = page.locator('a[target="_blank"]');
      const linkCount = await links.count();
      console.log(`  External links: ${linkCount}`);
      for (let i = 0; i < Math.min(linkCount, 3); i++) {
        const href = await links.nth(i).getAttribute('href');
        console.log(`    [${i}]: ${await links.nth(i).textContent()} → ${href}`);
      }

      // Confidence badges in popover
      const pctInPopover = page.locator('.w-80 >> text=/\\d+%/');
      const pctPopCount = await pctInPopover.count();
      console.log(`  Confidence badges: ${pctPopCount}`);
      for (let i = 0; i < Math.min(pctPopCount, 3); i++) {
        console.log(`    [${i}]: ${await pctInPopover.nth(i).textContent()}`);
      }

      // Excerpts in popover
      const popExcerpts = page.locator('.w-80 >> .leading-relaxed');
      const exCount = await popExcerpts.count();
      console.log(`  Excerpts: ${exCount}`);
      for (let i = 0; i < Math.min(exCount, 2); i++) {
        const t = await popExcerpts.nth(i).textContent();
        console.log(`    [${i}]: "${t?.slice(0, 80)}..."`);
      }
    }
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
    console.log(`Legend: AI=${hasLegendAI}, Web=${hasLegendWeb}`);
    console.log('===============\n');
    console.log('CONSOLE LOGS (last 20):\n' + consoleLogs.slice(-20).join('\n'));
  });
});
