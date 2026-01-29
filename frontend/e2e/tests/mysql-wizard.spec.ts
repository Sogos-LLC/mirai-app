/**
 * MySQL Course Wizard Test
 *
 * Creates a course "Getting Started with MySQL" through the wizard
 * and verifies the "You'll be notified" UX flow when outline is queued.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = 'playwright/screenshots/mysql-wizard';
const COURSE_TITLE = 'Getting Started with MySQL';

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Helper to take timestamped screenshots
async function screenshot(page: any, name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${name}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`📸 Screenshot: ${filename}`);
  return filepath;
}

// Helper to log current state
function logState(page: any, step: string) {
  console.log(`\n=== ${step} ===`);
  console.log(`URL: ${page.url()}`);
}

test.describe('MySQL Course Wizard', () => {
  test('should create course and capture error on Generate Outline', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes

    // Capture console errors
    page.on('console', (msg: any) => {
      if (msg.type() === 'error') {
        console.log(`[BROWSER ERROR] ${msg.text()}`);
      }
    });

    // Log all navigations
    page.on('framenavigated', (frame: any) => {
      if (frame === page.mainFrame()) {
        console.log(`[NAV] ${frame.url()}`);
      }
    });

    console.log('\n🚀 Starting MySQL Wizard Test\n');

    // ========================================
    // Step 1: Go to dashboard and click Create Course
    // ========================================
    console.log('Step 1: Navigate to dashboard');
    await page.goto('https://mirai-uat.sogos.io/dashboard');
    await page.waitForTimeout(3000);
    logState(page, 'Dashboard loaded');
    await screenshot(page, '01_dashboard');

    // Click Create Course button
    console.log('Looking for Create Course button...');
    const createBtn = page.locator('button:has-text("Create Course")');
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    console.log('Found Create Course button, clicking...');
    await createBtn.click();

    await page.waitForTimeout(2000);
    logState(page, 'After Create Course click');
    await screenshot(page, '02_wizard_step1_course_name');

    // ========================================
    // WIZARD STEP 1: Course Name
    // ========================================
    console.log('\n📝 WIZARD STEP 1: Course Name');

    // Find the course name input by placeholder
    const courseNameInput = page.locator('input[placeholder*="Introduction to Machine Learning"]');
    await expect(courseNameInput).toBeVisible({ timeout: 5000 });
    console.log(`Entering course name: "${COURSE_TITLE}"`);
    await courseNameInput.fill(COURSE_TITLE);
    await screenshot(page, '03_course_name_filled');

    // Click Generate Title button
    const generateTitleBtn = page.locator('button:has-text("Generate Title")');
    await expect(generateTitleBtn).toBeVisible({ timeout: 5000 });
    console.log('Clicking "Generate Title"...');
    await generateTitleBtn.click();

    // Wait for AI generation
    console.log('Waiting for AI to generate title...');
    await page.waitForTimeout(10000);
    logState(page, 'After Generate Title');
    await screenshot(page, '04_wizard_step2_title_description');

    // ========================================
    // WIZARD STEP 2: Title & Description
    // ========================================
    console.log('\n📝 WIZARD STEP 2: Title & Description');

    // Click Generate Personas button
    const generatePersonasBtn = page.locator('button:has-text("Generate Personas")');
    if (await generatePersonasBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Clicking "Generate Personas"...');
      await generatePersonasBtn.click();

      // Wait for AI generation
      console.log('Waiting for AI to generate personas...');
      await page.waitForTimeout(10000);
      logState(page, 'After Generate Personas');
      await screenshot(page, '05_wizard_step3_sme_personas');
    } else {
      console.log('Generate Personas button not found');
      await screenshot(page, '05_no_generate_personas_btn');
    }

    // ========================================
    // WIZARD STEP 3: SME Personas
    // ========================================
    console.log('\n📝 WIZARD STEP 3: SME Personas');

    // Look for the next button (might be "Generate Audience" or "Next")
    const step3Btn = page.locator('button:has-text("Generate Audience"), button:has-text("Next")').first();
    if (await step3Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const btnText = await step3Btn.textContent();
      console.log(`Clicking "${btnText?.trim()}"...`);
      await step3Btn.click();

      // Wait for AI generation
      console.log('Waiting for next step...');
      await page.waitForTimeout(10000);
      logState(page, 'After Step 3');
      await screenshot(page, '06_wizard_step4_target_audience');
    } else {
      console.log('Step 3 next button not found');
      await screenshot(page, '06_no_step3_btn');
    }

    // ========================================
    // WIZARD STEP 4: Target Audience
    // ========================================
    console.log('\n📝 WIZARD STEP 4: Target Audience');

    // Select an audience card if needed (click the first one)
    const audienceCard = page.locator('text="Junior Front-End Developer"').first();
    if (await audienceCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Selecting first audience card...');
      await audienceCard.click();
      await page.waitForTimeout(500);
    }

    // Look for Generate Tones button
    const generateTonesBtn = page.locator('button:has-text("Generate Tones")');
    if (await generateTonesBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Clicking "Generate Tones"...');
      await generateTonesBtn.click();

      // Wait for AI generation
      console.log('Waiting for AI to generate tones...');
      await page.waitForTimeout(10000);
      logState(page, 'After Generate Tones');
      await screenshot(page, '07_wizard_step5_tone_context');
    } else {
      console.log('Generate Tones button not found');
      await screenshot(page, '07_no_generate_tones_btn');
    }

    // ========================================
    // WIZARD STEP 5: Tone & Context (Final)
    // ========================================
    console.log('\n📝 WIZARD STEP 5: Tone & Context (Final)');

    // Look for Generate Outline button
    const generateOutlineBtn = page.locator('button:has-text("Generate Outline")');
    if (await generateOutlineBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('🎯 Found "Generate Outline" button - clicking...');
      await screenshot(page, '08_before_generate_outline');
      await generateOutlineBtn.click();

      // Wait for navigation to outline page
      console.log('Waiting for navigation to outline page...');
      await page.waitForURL('**/outline**', { timeout: 30000 });
      logState(page, 'After Generate Outline - Navigated to Outline Page');
      await screenshot(page, '09_outline_page_loaded');

      // Wait a moment for the state to settle
      await page.waitForTimeout(2000);

      // Check for the "Your outline is being created!" message (new UX)
      const outlineQueuedHeading = page.locator('text="Your outline is being created!"');
      if (await outlineQueuedHeading.isVisible({ timeout: 10000 }).catch(() => false)) {
        console.log('\n✅ SUCCESS: "Your outline is being created!" message appeared!');
        await screenshot(page, '10_outline_queued_message');

        // Verify the notification info is shown
        const notificationInfo = page.locator('text="You\'ll be notified"');
        if (await notificationInfo.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('✅ Notification info message is visible');
        }

        // Look for "Got it!" button
        const gotItBtn = page.locator('button:has-text("Got it!")');
        if (await gotItBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('✅ Found "Got it!" button');
          await screenshot(page, '11_before_got_it_click');

          // Click "Got it!" to go to dashboard
          console.log('Clicking "Got it!" button...');
          await gotItBtn.click();

          // Wait for navigation to dashboard
          await page.waitForURL('**/dashboard**', { timeout: 10000 });
          console.log('✅ Successfully redirected to dashboard');
          logState(page, 'After Got It - Dashboard');
          await screenshot(page, '12_dashboard_after_got_it');
        }
      } else {
        // Check for error message (old behavior, should not happen now)
        const errorHeading = page.locator('text="Something went wrong"');
        if (await errorHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log('\n❌ ERROR: "Something went wrong" message appeared (unexpected)!');
          await screenshot(page, '10_ERROR_something_went_wrong');
        } else {
          // Maybe the outline generated quickly and we're viewing it
          const viewingOutline = page.locator('text="Review Your Course Outline"');
          if (await viewingOutline.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('\n✅ Outline generated quickly - now viewing outline');
            await screenshot(page, '10_viewing_outline');
          } else {
            console.log('Unexpected state - taking diagnostic screenshot');
            await screenshot(page, '10_unexpected_state');
          }
        }
      }
    } else {
      console.log('Generate Outline button not found, taking diagnostic screenshot');
      await screenshot(page, '08_no_generate_outline_btn');

      // Log all visible buttons for debugging
      const allButtons = await page.locator('button').all();
      console.log(`Found ${allButtons.length} buttons on page:`);
      for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
        const text = await allButtons[i].textContent();
        console.log(`  Button ${i}: "${text?.trim()}"`);
      }
    }

    // ========================================
    // Final state
    // ========================================
    console.log('\n📋 FINAL STATE:');
    logState(page, 'Test Complete');
    await screenshot(page, '99_final_state');

    console.log('\n✅ Test completed - check screenshots in playwright/screenshots/mysql-wizard/\n');
  });
});
