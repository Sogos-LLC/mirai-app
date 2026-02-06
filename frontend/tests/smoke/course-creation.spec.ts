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
    // Budget: ~2min wizard auto-gen + up to 3min outline gen + up to 10min lessons
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

    // Wait for the idle form to appear — retry if a stale workflow briefly shows
    let started = false;
    for (let attempt = 1; attempt <= 5 && !started; attempt++) {
      console.log(`Attempt ${attempt}: waiting for wizard form...`);

      const detected = await Promise.race([
        page.locator('#courseName').waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'form' as const),
        page.locator('text=Review Course Outline').waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'outline' as const),
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
          await page.click('button:has-text("Generate Course")', { timeout: 3_000 });
          console.log('Started new workflow');
          started = true;
        } catch {
          console.log('  form disappeared — stale job fired RESUME, waiting...');
          await page.waitForTimeout(5_000);
        }
      } else if (detected === 'outline') {
        console.log('  found active outline review — will proceed to approval');
        started = true;
      } else if (detected === 'failed') {
        console.log('  stale workflow cleaned up — refreshing');
        await page.goto('/course/wizard');
        await page.waitForLoadState('domcontentloaded');
      } else if (detected === 'completed') {
        console.log('  previous course completed — navigating back');
        await page.goto('/dashboard');
        await page.click('button:has-text("Create Course")');
        await page.waitForURL('**/course/wizard');
        await page.waitForLoadState('domcontentloaded');
      } else if (detected === 'processing') {
        console.log('  stale processing — waiting for backend to clean up...');
        await page.waitForTimeout(8_000);
      } else {
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
    // PHASE 1: Wait for auto-generation to complete (title, outcomes,
    // personas, tone, outline) — the only approval step is outline review
    // =====================================================================
    console.log('Waiting for outline review (auto-generating wizard steps)...');

    // Wait up to 5 minutes for auto-generation + outline to reach approval
    const phase1Result = await Promise.race([
      page.locator('text=Review Course Outline').waitFor({ state: 'visible', timeout: 300_000 }).then(() => 'outline' as const),
      page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 300_000 }).then(() => 'completed' as const),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 300_000 }).then(() => 'failed' as const),
      page.locator('text=Application error').waitFor({ state: 'visible', timeout: 300_000 }).then(() => 'crashed' as const),
    ]);

    console.log(`Phase 1 result: ${phase1Result}`);
    await screenshot(page, `phase1-${phase1Result}`);

    if (phase1Result === 'failed') {
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      const errorEl = page.locator('.text-secondary').first();
      const errorText = await errorEl.textContent().catch(() => 'unknown');
      throw new Error(`Workflow failed during auto-generation: ${errorText}`);
    }

    if (phase1Result === 'crashed') {
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      throw new Error('Application crashed during auto-generation');
    }

    // =====================================================================
    // PHASE 2: Approve the outline (the only manual step)
    // =====================================================================
    if (phase1Result === 'outline') {
      console.log('Outline review visible — approving...');

      // Verify outline sections are rendered
      const sectionCount = await page.locator('[class*="rounded-lg border bg-page"]').count();
      console.log(`Outline has ${sectionCount} sections`);
      await screenshot(page, 'outline-review');

      // Click "Approve & Generate Lessons"
      const approveBtn = page.locator('button:has-text("Approve & Generate Lessons")');
      await expect(approveBtn).toBeVisible({ timeout: 5_000 });
      await approveBtn.click();

      // Wait for the button to disappear (transitioning to processing state)
      await approveBtn.waitFor({ state: 'hidden', timeout: 10_000 });
      console.log('Outline approved — waiting for lessons to generate...');
      await screenshot(page, 'lessons-generating');
    }

    // =====================================================================
    // PHASE 3: Wait for lesson generation + structural elements + completion
    // Budget: up to 10 minutes
    // =====================================================================
    const phase3Result = await Promise.race([
      page.locator('text=Course Created!').waitFor({ state: 'visible', timeout: 600_000 }).then(() => 'completed' as const),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 600_000 }).then(() => 'failed' as const),
    ]);

    console.log(`Phase 3 result: ${phase3Result}`);
    await screenshot(page, `phase3-${phase3Result}`);

    if (phase3Result === 'failed') {
      console.log('CONSOLE LOGS:\n' + consoleLogs.join('\n'));
      const errorEl = page.locator('.text-secondary').first();
      const errorText = await errorEl.textContent().catch(() => 'unknown');
      throw new Error(`Workflow failed during lesson generation: ${errorText}`);
    }

    // Verify completion
    await expect(page.locator('text=Course Created!')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Open in Editor")')).toBeVisible();
    await screenshot(page, 'course-completed');

    // Click Open in Editor to verify the course is accessible
    await page.click('button:has-text("Open in Editor")');
    await page.waitForURL('**/course/*/editor', { timeout: 15_000 });
    await screenshot(page, 'course-editor');
    console.log('Course editor loaded successfully!');

    // Dump last console logs for reference
    console.log('CONSOLE LOGS (last 30):\n' + consoleLogs.slice(-30).join('\n'));
  });
});
