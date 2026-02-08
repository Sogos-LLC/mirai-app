import { test, expect, Page } from '@playwright/test';
import { screenshot, resetScreenshotCounter } from '../helpers';

/**
 * End-to-end test for course creation with Internal Knowledge + Strict Mode.
 *
 * Prerequisites:
 * - At least one knowledge document uploaded (e.g., Travel-Guide.md)
 * - Auth session active (tests/.auth/user.json)
 *
 * This validates the ResearchOrchestrator pipeline:
 *   health check → RAG search → knowledge synthesis → course generation
 */

const TOPIC = 'Travel Planning and Destination Research';
const AUDIENCE = 'People who want to learn how to plan trips effectively';

const APPROVAL_STEPS = [
  { name: 'analysis', button: 'Approve Analysis', timeout: 180_000 },
  { name: 'outcomes', button: 'Approve Outcomes', timeout: 180_000 },
  { name: 'structure', button: 'Approve Structure', timeout: 180_000 },
  { name: 'lesson', button: 'Approve Lesson', timeout: 180_000 },
  { name: 'export', button: 'Approve & Export', timeout: 420_000 },
];

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
        console.log('  waiting for stale export...');
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

test.describe('Internal Knowledge + Strict Mode Course Creation', () => {
  test.beforeAll(() => {
    resetScreenshotCounter();
    console.log(`\n--- Internal Knowledge Strict Mode Test ---`);
    console.log(`    Topic: "${TOPIC}"`);
    console.log(`    Audience: "${AUDIENCE}"\n`);
  });

  test('end-to-end course creation with internal knowledge and strict mode', async ({ page }) => {
    test.setTimeout(900_000);

    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => consoleLogs.push(`[PAGE_ERROR] ${err.message}`));

    // =====================================================================
    // Phase 0: Navigate to wizard, clear any stale workflow
    // =====================================================================
    console.log('Phase 0: Navigating to wizard...');
    await page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);

    const hasStale = await Promise.race([
      page.locator('#topic').waitFor({ state: 'visible', timeout: 5_000 }).then(() => false),
      page.locator('button:has-text("Approve")').first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => true),
      page.locator('.animate-spin').first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => true),
      page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 5_000 }).then(() => true),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 5_000 }).then(() => true),
    ]).catch(() => false);

    if (hasStale) {
      await clearStaleWorkflow(page);
      await page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3_000);
    }

    await screenshot(page, 'wizard-initial');

    // =====================================================================
    // Phase 1: Fill form + enable internal knowledge + strict mode
    // =====================================================================
    console.log('Phase 1: Filling wizard form...');

    // Wait for the form to be visible
    await expect(page.locator('#topic')).toBeVisible({ timeout: 15_000 });

    // Fill topic and audience
    await page.fill('#topic', TOPIC);
    await page.fill('#audience', AUDIENCE);
    await screenshot(page, 'form-filled');

    // Enable Internal Knowledge toggle
    console.log('  Enabling internal knowledge...');
    const knowledgeToggle = page.locator('#internalKnowledge');
    await knowledgeToggle.check({ force: true });
    await page.waitForTimeout(500);
    await screenshot(page, 'internal-knowledge-enabled');

    // Click "Select Knowledge Sources" button to open the modal
    console.log('  Opening knowledge selection modal...');
    const selectSourcesBtn = page.locator('button:has-text("Select Knowledge Sources")');
    await expect(selectSourcesBtn).toBeVisible({ timeout: 5_000 });
    await selectSourcesBtn.click();
    await page.waitForTimeout(2_000);

    // Wait for the modal to open
    const modalHeading = page.locator('h2:has-text("Select Knowledge Sources")');
    await expect(modalHeading).toBeVisible({ timeout: 10_000 });
    await screenshot(page, 'knowledge-modal-open');

    // The document is on the Team tab — switch to it
    console.log('  Switching to Team tab...');
    const teamTab = page.locator('button:has-text("Team")').first();
    await teamTab.click();
    await page.waitForTimeout(2_000);
    await screenshot(page, 'knowledge-modal-team-tab');

    // Look for a document to select — try Travel-Guide.md first, fall back to any available
    // Source cards are inside the modal's scrollable content area
    const modalContainer = page.locator('.fixed.inset-0 .bg-surface');
    const travelGuide = modalContainer.locator('text=Travel-Guide.md').first();
    const hasTravelGuide = await travelGuide.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasTravelGuide) {
      console.log('  Selecting Travel-Guide.md...');
      await travelGuide.click();
    } else {
      // Try the Global tab as well
      console.log('  Travel-Guide.md not found on Team tab, checking Global...');
      const globalTab = page.locator('button:has-text("Global")').first();
      await globalTab.click();
      await page.waitForTimeout(2_000);

      // Look for any source card button (the clickable area inside a SourceCard)
      const anySource = modalContainer.locator('button.w-full.text-left').first();
      const hasAny = await anySource.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasAny) {
        console.log('  Selecting first available global source...');
        await anySource.click();
      } else {
        await screenshot(page, 'no-knowledge-sources');
        console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
        throw new Error('No knowledge sources available on Global or Team tabs. Upload a document first (e.g., Travel-Guide.md).');
      }
    }
    await page.waitForTimeout(500);
    await screenshot(page, 'knowledge-source-selected');

    // Click Confirm to close the modal
    console.log('  Confirming selection...');
    const confirmBtn = page.locator('button:has-text("Confirm")').last();
    await confirmBtn.click();
    await page.waitForTimeout(1_000);
    await screenshot(page, 'knowledge-modal-closed');

    // Verify the selection badge appears (e.g., "1 source selected")
    await expect(page.locator('text=source selected').or(page.locator('text=sources selected'))).toBeVisible({ timeout: 5_000 });

    // Enable Strict Mode toggle (only appears after sources are selected)
    console.log('  Enabling strict mode...');
    const strictToggle = page.locator('#strictKnowledge');
    await expect(strictToggle).toBeVisible({ timeout: 5_000 });
    await strictToggle.check({ force: true });
    await page.waitForTimeout(500);
    await screenshot(page, 'strict-mode-enabled');

    // Verify strict mode is checked
    await expect(strictToggle).toBeChecked();

    // Verify web research is NOT enabled (strict mode = only internal)
    const webResearchToggle = page.locator('#webResearch');
    await expect(webResearchToggle).not.toBeChecked();

    console.log('  Form configured: Internal Knowledge ON, Strict Mode ON, Web Research OFF');

    // =====================================================================
    // Phase 2: Start course creation
    // =====================================================================
    console.log('Phase 2: Starting course creation...');
    await page.click('button:has-text("Generate Course")', { timeout: 5_000 });

    // Wait for transition from idle to processing/approval/error
    const postClick = await Promise.race([
      page.locator('.animate-spin').first().waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'processing' as const),
      page.locator('button:has-text("Approve")').first().waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'approval' as const),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'error' as const),
    ]).catch(() => 'unknown' as const);

    console.log(`  Post-click state: ${postClick}`);
    await screenshot(page, `post-start-${postClick}`);

    if (postClick === 'error') {
      // Capture error details
      const errorText = await page.locator('[data-wizard-state="failed"]').textContent().catch(() => '');
      console.log(`  Error text: ${errorText}`);
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));

      // Check if it's a strict mode failure (expected if no vectors)
      if (errorText?.includes('Strict knowledge mode') || errorText?.includes('no vectors')) {
        throw new Error(
          `Strict mode enforcement triggered: ${errorText}. ` +
          'This means the knowledge source has no vectors in Qdrant. Re-upload the document.'
        );
      }
      throw new Error(`Workflow failed after start: ${errorText}`);
    }

    if (postClick === 'unknown') {
      await screenshot(page, 'start-unknown-state');
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error('Unknown state after clicking Generate Course');
    }

    // =====================================================================
    // Phase 3: Walk through all 5 approval steps
    // =====================================================================
    console.log('Phase 3: Walking through approval steps...');

    for (const step of APPROVAL_STEPS) {
      console.log(`  Waiting for step: ${step.name} (timeout: ${step.timeout / 1000}s)...`);

      const result = await Promise.race([
        page.locator(`button:has-text("${step.button}")`).waitFor({ state: 'visible', timeout: step.timeout }).then(() => 'approval' as const),
        page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: step.timeout }).then(() => 'completed' as const),
        page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: step.timeout }).then(() => 'failed' as const),
        page.locator('text=Application error').waitFor({ state: 'visible', timeout: step.timeout }).then(() => 'crashed' as const),
      ]);

      console.log(`    ${step.name}: ${result}`);
      await screenshot(page, `step-${step.name}-${result}`);

      if (result === 'failed') {
        const errorText = await page.locator('text=Something went wrong').locator('..').textContent().catch(() => '');
        console.log(`  Failure details: ${errorText}`);
        console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
        throw new Error(`Workflow failed at step: ${step.name}. Details: ${errorText}`);
      }
      if (result === 'crashed') {
        console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
        throw new Error(`Application crashed at step: ${step.name}`);
      }
      if (result === 'completed') {
        console.log('    Course completed early — skipping remaining steps');
        break;
      }

      // Approve the step
      const approveBtn = page.locator(`button:has-text("${step.button}")`);
      await approveBtn.click();
      console.log(`    Approved: ${step.name}`);
      await approveBtn.waitFor({ state: 'hidden', timeout: 10_000 });
      await screenshot(page, `step-${step.name}-approved`);
    }

    // =====================================================================
    // Phase 4: Wait for final completion
    // =====================================================================
    console.log('Phase 4: Waiting for course completion...');

    const finalResult = await Promise.race([
      page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 600_000 }).then(() => 'completed' as const),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 600_000 }).then(() => 'failed' as const),
    ]).catch(() => 'timeout' as const);

    console.log(`  Final result: ${finalResult}`);
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

    // =====================================================================
    // Phase 5: Open in editor and verify source attributions
    // =====================================================================
    console.log('Phase 5: Opening course in editor...');

    const editorBtn = page.locator('button:has-text("Open in Editor")');
    if (await editorBtn.isVisible()) {
      await editorBtn.click();
      await page.waitForURL('**/course/*/editor', { timeout: 15_000 });
      await page.waitForTimeout(3_000);
      await screenshot(page, 'course-editor');

      // Check for source mode toggle (FileSearch icon)
      const sourceModeToggle = page.locator('button[title="Source Mode"]').or(page.locator('button:has-text("Sources")'));
      const hasSourceMode = await sourceModeToggle.first().isVisible({ timeout: 5_000 }).catch(() => false);

      if (hasSourceMode) {
        console.log('  Source mode toggle found — checking attributions...');
        await sourceModeToggle.first().click();
        await page.waitForTimeout(2_000);
        await screenshot(page, 'source-mode-active');

        // Check if there's any grounding percentage > 0
        const summaryBar = page.locator('[class*="source"]').or(page.locator('text=grounded'));
        const hasSummary = await summaryBar.first().isVisible({ timeout: 5_000 }).catch(() => false);
        if (hasSummary) {
          await screenshot(page, 'source-attribution-visible');
          console.log('  Source attributions visible in editor');
        } else {
          console.log('  No source attribution summary bar found (may need to select a lesson first)');
        }
      } else {
        console.log('  Source mode toggle not found in editor');
      }

      console.log('  Course editor loaded successfully');
    }

    // Dump console logs
    console.log('CONSOLE LOGS (last 30):\n' + consoleLogs.slice(-30).join('\n'));
  });
});
