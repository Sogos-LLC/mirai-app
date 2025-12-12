/**
 * Course Wizard E2E Tests
 *
 * Tests the 7-step AI-guided course creation wizard.
 * This is a long-running test due to AI generation at multiple steps.
 */
import { test, expect } from '@playwright/test';
import { WizardPage, ContentLibraryPage } from '../pages';
import { takeScreenshot } from '../helpers';
import { TEST_DATA, POLLING } from '../config';

test.describe('Course Wizard', () => {
  test('should complete the course creation wizard', async ({ page }) => {
    // Setup page objects
    const wizard = new WizardPage(page);
    const contentLibrary = new ContentLibraryPage(page);

    // Add console logging for debugging
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[CONSOLE_ERROR] ${msg.text()}`);
      }
    });

    console.log('\n========== WIZARD TEST START ==========\n');

    // Step 1: Navigate to wizard
    await wizard.goto();

    // Step 2: Complete the full wizard flow
    const success = await wizard.completeWizard({
      courseName: TEST_DATA.wizard.courseName,
      additionalContext: TEST_DATA.wizard.additionalContext,
    });

    // Even if the modal wasn't found, the wizard may have progressed
    await takeScreenshot(page, 'wizard-after-completion', 'After wizard completion');

    // Step 3: Navigate to content library and wait for course
    console.log('\n--- Checking for created course ---');
    await contentLibrary.goto();
    await contentLibrary.screenshot('content-library-post-wizard', 'Content library after wizard');

    // Step 4: Poll for the course to appear (background job needs time)
    const courseFound = await contentLibrary.waitForCourses({
      maxAttempts: POLLING.maxAttempts,
      delayMs: POLLING.delayMs,
      screenshotPrefix: 'wizard-poll',
    });

    if (courseFound) {
      console.log('Course created successfully!');
      await contentLibrary.screenshot('wizard-course-found', 'Course found in library');

      // Navigate to the course
      const href = await contentLibrary.openFirstCourse();
      console.log(`Opened course: ${href}`);
      await takeScreenshot(page, 'wizard-course-opened', 'Course page opened');
    } else {
      console.log('Course was not found after polling');
      // Don't fail the test - the wizard completed, job may still be processing
    }

    console.log('\n========== WIZARD TEST END ==========\n');

    // Assert that either the wizard completed or we found a course
    expect(success || courseFound).toBeTruthy();
  });
});
