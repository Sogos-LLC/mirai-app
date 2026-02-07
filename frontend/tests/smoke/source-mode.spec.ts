import { test, expect } from '@playwright/test';
import { screenshot, resetScreenshotCounter } from '../helpers';

/**
 * Source Mode & Provenance Tests
 *
 * Verifies that the source attribution UI works correctly in the course editor.
 * Prerequisites: At least one course must exist (created with web research ON
 * to see web source badges).
 */
test.describe('Source Mode & Provenance', () => {
  test.beforeAll(() => {
    resetScreenshotCounter();
  });

  test('source mode shows attribution badges, summary bar, and provenance panel', async ({ page }) => {
    test.setTimeout(120_000);

    // Capture console for debugging
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => consoleLogs.push(`[PAGE_ERROR] ${err.message}`));

    // =====================================================================
    // Phase 1: Navigate to the most recent course's editor
    // =====================================================================
    console.log('Navigating to dashboard...');
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await screenshot(page, 'source-dashboard');

    // Find and click the first course card link to open it
    // Courses link to /course/{id}/editor when clicked
    const courseLink = page.locator('a[href*="/course/"]').first();
    const courseExists = await courseLink.isVisible().catch(() => false);
    if (!courseExists) {
      console.log('No courses found — skipping test');
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      test.skip(true, 'No courses exist on dashboard');
      return;
    }

    const href = await courseLink.getAttribute('href');
    console.log(`Found course link: ${href}`);

    // Navigate to the editor
    const editorUrl = href?.includes('/editor') ? href : `${href}/editor`;
    await page.goto(editorUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await screenshot(page, 'source-editor-loaded');

    // =====================================================================
    // Phase 2: Verify lesson is loaded with components
    // =====================================================================
    console.log('Waiting for lesson content to load...');

    // Wait for at least one lesson component (sortable items) to appear
    // The editor renders components inside the lesson card
    const componentLocator = page.locator('[data-component-id], .sortable-component, [class*="component"]').first();
    await componentLocator.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
      console.log('No component selector found — looking for text content');
    });

    // Also check for the Sources button which only appears when a lesson is loaded
    const sourcesButton = page.locator('button:has-text("Sources")');
    await sourcesButton.waitFor({ state: 'visible', timeout: 15_000 });
    console.log('Sources button visible');

    // Check if grounded badge exists
    const groundedBadge = page.locator('button:has-text("grounded")');
    const hasGroundedBadge = await groundedBadge.isVisible().catch(() => false);
    console.log(`Grounded badge visible: ${hasGroundedBadge}`);

    await screenshot(page, 'source-before-toggle');

    // =====================================================================
    // Phase 3: Toggle Source Mode ON
    // =====================================================================
    console.log('Clicking Sources button to enable source mode...');
    await sourcesButton.click();
    await page.waitForTimeout(1_000);
    await screenshot(page, 'source-mode-on');

    // Verify source mode is active — SourceSummaryBar should appear
    // SourceSummaryBar has "Source Distribution" text
    const summaryBar = page.locator('text=Source Distribution');
    const hasSummaryBar = await summaryBar.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(`Source Distribution bar visible: ${hasSummaryBar}`);

    // Check for grounded percentage in summary bar
    const groundedText = page.locator('text=/\\d+% grounded/').first();
    const groundedVisible = await groundedText.isVisible().catch(() => false);
    if (groundedVisible) {
      const groundedContent = await groundedText.textContent();
      console.log(`Grounded badge text: ${groundedContent}`);
    }

    // Check for source type badges (AI Generated, Web Search, Internal Knowledge)
    const aiBadge = page.locator('button:has-text("AI Generated")');
    const webBadge = page.locator('button:has-text("Web Search")');
    const internalBadge = page.locator('button:has-text("Internal Knowledge")');

    const aiCount = await aiBadge.count();
    const webCount = await webBadge.count();
    const internalCount = await internalBadge.count();
    console.log(`Source badges — AI Generated: ${aiCount}, Web Search: ${webCount}, Internal Knowledge: ${internalCount}`);

    // Take a full page screenshot showing all source overlays
    await screenshot(page, 'source-mode-badges');

    // Verify at least some badges exist (source mode is working)
    expect(aiCount + webCount + internalCount).toBeGreaterThan(0);

    // Check the legend counts in the summary bar
    const legendAI = page.locator('text=/AI \\(\\d+\\)/');
    const legendWeb = page.locator('text=/Web \\(\\d+\\)/');
    const legendInternal = page.locator('text=/Internal \\(\\d+\\)/');
    const hasLegendAI = await legendAI.isVisible().catch(() => false);
    const hasLegendWeb = await legendWeb.isVisible().catch(() => false);
    const hasLegendInternal = await legendInternal.isVisible().catch(() => false);
    console.log(`Legend — AI: ${hasLegendAI}, Web: ${hasLegendWeb}, Internal: ${hasLegendInternal}`);

    // =====================================================================
    // Phase 4: Click grounded badge to open ProvenancePanel
    // =====================================================================
    if (hasGroundedBadge) {
      console.log('Clicking grounded badge to open ProvenancePanel...');
      await groundedBadge.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'source-provenance-panel');

      // ProvenancePanel shows "Knowledge Source Attribution" header
      const attributionHeader = page.locator('text=Knowledge Source Attribution');
      const hasAttribution = await attributionHeader.isVisible().catch(() => false);
      console.log(`Knowledge Source Attribution panel visible: ${hasAttribution}`);

      // Read the metrics
      const sourcesMetric = page.locator('span:has-text("Sources")').locator('..').locator('.font-medium');
      const ungroundedMetric = page.locator('span:has-text("Ungrounded")').locator('..').locator('.font-medium');

      if (hasAttribution) {
        const sourcesValue = await sourcesMetric.textContent().catch(() => 'N/A');
        const ungroundedValue = await ungroundedMetric.textContent().catch(() => 'N/A');
        console.log(`Provenance metrics — Sources: ${sourcesValue}, Ungrounded: ${ungroundedValue}`);
      }

      // Check for Source Citations section
      const citations = page.locator('text=Source Citations');
      const hasCitations = await citations.isVisible().catch(() => false);
      console.log(`Source Citations section visible: ${hasCitations}`);
    }

    // =====================================================================
    // Phase 5: Click a source badge on a component to see detail popover
    // =====================================================================
    // Try clicking a web badge first, then AI badge as fallback
    let clickedBadge = false;

    if (webCount > 0) {
      console.log('Clicking Web Search badge on first component...');
      await webBadge.first().click();
      clickedBadge = true;
    } else if (aiCount > 0) {
      console.log('Clicking AI Generated badge on first component...');
      await aiBadge.first().click();
      clickedBadge = true;
    }

    if (clickedBadge) {
      await page.waitForTimeout(500);
      await screenshot(page, 'source-detail-popover');

      // SourceDetailPopover shows "Source Details" header
      const detailHeader = page.locator('text=Source Details');
      const hasDetail = await detailHeader.isVisible().catch(() => false);
      console.log(`Source Details popover visible: ${hasDetail}`);

      // Check for web source links (if web badge was clicked)
      if (webCount > 0) {
        const webLinks = page.locator('.truncate').filter({ hasText: /\.\w+/ });
        const linkCount = await webLinks.count();
        console.log(`Web source links in popover: ${linkCount}`);
      }

      // Check for "AI Generated" card (if AI badge was clicked)
      if (webCount === 0) {
        const aiCard = page.locator('text=AI Generated').nth(1);
        const hasAICard = await aiCard.isVisible().catch(() => false);
        console.log(`AI Generated detail card visible: ${hasAICard}`);
      }

      await screenshot(page, 'source-detail-content');
    }

    // =====================================================================
    // Phase 6: Toggle Source Mode OFF and verify cleanup
    // =====================================================================
    console.log('Toggling source mode off...');
    await sourcesButton.click();
    await page.waitForTimeout(500);

    // Summary bar should disappear
    const summaryGone = await summaryBar.isVisible().catch(() => false);
    console.log(`Source Distribution still visible after toggle off: ${summaryGone}`);
    expect(summaryGone).toBe(false);

    await screenshot(page, 'source-mode-off');

    // =====================================================================
    // Summary
    // =====================================================================
    console.log('\n=== SOURCE MODE TEST SUMMARY ===');
    console.log(`Source badges: AI=${aiCount}, Web=${webCount}, Internal=${internalCount}`);
    console.log(`Grounded badge: ${hasGroundedBadge}`);
    console.log(`Summary bar: ${hasSummaryBar}`);
    console.log(`Legend: AI=${hasLegendAI}, Web=${hasLegendWeb}, Internal=${hasLegendInternal}`);
    console.log('================================\n');

    // Dump console logs
    console.log('CONSOLE LOGS (last 20):\n' + consoleLogs.slice(-20).join('\n'));
  });
});
