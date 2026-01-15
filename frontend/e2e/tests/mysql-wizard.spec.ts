/**
 * MySQL Course Wizard Test
 *
 * Creates a course "Getting Started with MySQL" through the wizard
 * to reproduce the "Something went wrong" error on outline generation.
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

      // Wait for the response (error expected)
      console.log('Waiting for response after Generate Outline...');
      await page.waitForTimeout(15000);
      logState(page, 'After Generate Outline');
      await screenshot(page, '09_after_generate_outline');

      // Check for error message
      const errorHeading = page.locator('text="Something went wrong"');
      if (await errorHeading.isVisible({ timeout: 20000 }).catch(() => false)) {
        console.log('\n❌ ERROR CAPTURED: "Something went wrong" message appeared!');
        await screenshot(page, '10_ERROR_something_went_wrong');

        // Capture error details
        const errorDetail = page.locator('text="No outline found"');
        if (await errorDetail.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('Error detail: "No outline found for this course"');
        }

        // Look for Go to Dashboard button
        const dashboardBtn = page.locator('button:has-text("Go to Dashboard")');
        if (await dashboardBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('Found "Go to Dashboard" button on error page');
        }
      } else {
        console.log('No error message found - checking current page state');
        await screenshot(page, '10_no_error_found');
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
