/**
 * Image Generation E2E Tests
 *
 * Tests the image generation feature within the course editor.
 * Prerequisites: A course with lessons must exist.
 *
 * This test is designed to capture the actual error from the backend
 * when image generation fails.
 */
import { test, expect } from '@playwright/test';
import { ContentLibraryPage, CourseEditorPage } from '../pages';
import { takeScreenshot } from '../helpers';
import { TEST_DATA } from '../config';

test.describe('Image Generation', () => {
  test.beforeEach(async ({ page }) => {
    // Capture all console messages for debugging
    page.on('console', (msg) => {
      const type = msg.type().toUpperCase();
      if (type === 'ERROR' || type === 'WARNING') {
        console.log(`[${type}] ${msg.text()}`);
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      console.error(`[PAGE_ERROR] ${error.message}`);
    });

    // Capture API responses for AIGenerationService
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('AIGenerationService')) {
        const status = response.status();
        console.log(`[API] ${status} ${url}`);

        if (status >= 400) {
          try {
            const text = await response.text();
            console.error(`[API_ERROR] Response body:\n${text}`);
          } catch {
            console.error('[API_ERROR] Could not read response body');
          }
        }
      }
    });
  });

  test('should test image generation in course editor', async ({ page }) => {
    // Setup page objects
    const contentLibrary = new ContentLibraryPage(page);
    const courseEditor = new CourseEditorPage(page);

    console.log('\n========== IMAGE GENERATION TEST START ==========\n');

    // Step 1: Navigate to content library
    console.log('\n--- Step 1: Navigate to Content Library ---');
    await contentLibrary.goto();
    await contentLibrary.selectFolder('Private');
    await contentLibrary.screenshot('img-01-content-library', 'Content library');

    // Step 2: Check for existing courses
    console.log('\n--- Step 2: Looking for courses ---');
    const courseCount = await contentLibrary.getCourseCount();
    console.log(`Found ${courseCount} course(s)`);

    if (courseCount === 0) {
      await contentLibrary.screenshot('img-02-no-courses', 'No courses found');
      console.log('No courses found. Please run the wizard test first to create a course.');
      test.skip();
      return;
    }

    // Step 3: Open the first course
    console.log('\n--- Step 3: Opening course ---');
    const courseHref = await contentLibrary.openFirstCourse();
    console.log(`Opened course: ${courseHref}`);
    await takeScreenshot(page, 'img-03-course-page', 'Course page');

    // Step 4: Navigate to editor
    console.log('\n--- Step 4: Navigate to Editor ---');
    const courseId = courseEditor.getCurrentCourseId();

    if (courseId) {
      await courseEditor.goto(courseId);
    } else {
      // Try clicking an "Edit" button
      const editBtn = page.getByRole('button', { name: /edit|editor/i });
      if ((await editBtn.count()) > 0) {
        await editBtn.click();
        await page.waitForURL(/\/editor/, { timeout: 15000 });
      }
    }

    await courseEditor.screenshot('img-04-editor', 'Course editor');

    // Step 5: Select first lesson
    console.log('\n--- Step 5: Select Lesson ---');
    try {
      await courseEditor.selectFirstLesson();
    } catch (error) {
      console.log('Could not select lesson, may already be selected');
    }
    await courseEditor.screenshot('img-05-lesson', 'Lesson selected');

    // Step 6: Find and click image component
    console.log('\n--- Step 6: Open Image Component ---');
    const imageOpened = await courseEditor.openFirstImageComponent();

    if (!imageOpened) {
      console.log('No image component found in this lesson');
      await courseEditor.screenshot('img-06-no-image-component', 'No image component');

      // List what components are visible
      const components = await page.locator('[data-component-type], [class*="component"]').all();
      console.log(`Found ${components.length} general components`);

      test.skip();
      return;
    }

    await courseEditor.screenshot('img-06-image-modal', 'Image editor modal');

    // Step 7: Fill prompt and generate
    console.log('\n--- Step 7: Generate Image ---');
    await courseEditor.fillImagePrompt(TEST_DATA.imageGeneration.prompt);
    await courseEditor.screenshot('img-07-prompt-filled', 'Prompt filled');

    // Step 8: Click generate and wait for result
    console.log('\n--- Step 8: Waiting for Result ---');
    await courseEditor.clickGenerateImage();
    await courseEditor.screenshot('img-08-generating', 'Generating...');

    const result = await courseEditor.waitForImageGenerationResult();

    // Log the result
    console.log('\n========== IMAGE GENERATION RESULT ==========');
    console.log(`Success: ${result.success}`);
    if (result.error) {
      console.error(`Error: ${result.error}`);
    }
    if (result.imageUrl) {
      console.log(`Image URL: ${result.imageUrl}`);
    }
    console.log('==============================================\n');

    await courseEditor.screenshot('img-09-result', 'Final result');

    // Take final screenshot of browser console
    await takeScreenshot(page, 'img-10-final', 'Test complete');

    console.log('\n========== IMAGE GENERATION TEST END ==========\n');

    // For now, we're capturing the error - don't assert success
    // This test is for debugging the image generation issue
    if (!result.success) {
      console.log('Image generation failed (expected - debugging issue)');
      console.log('Error captured:', result.error);
    }
  });

  test('should capture API error details on image generation failure', async ({ page }) => {
    // This test specifically focuses on capturing detailed error information
    const contentLibrary = new ContentLibraryPage(page);
    const courseEditor = new CourseEditorPage(page);

    // Track all API errors
    const apiErrors: { url: string; status: number; body: string }[] = [];

    page.on('response', async (response) => {
      if (response.url().includes('AIGenerationService') && response.status() >= 400) {
        try {
          const body = await response.text();
          apiErrors.push({
            url: response.url(),
            status: response.status(),
            body,
          });
        } catch {
          // Ignore
        }
      }
    });

    // Navigate to existing course
    await contentLibrary.goto();
    await contentLibrary.selectFolder('Private');

    const courseCount = await contentLibrary.getCourseCount();
    if (courseCount === 0) {
      test.skip();
      return;
    }

    await contentLibrary.openFirstCourse();

    const courseId = courseEditor.getCurrentCourseId();
    if (courseId) {
      await courseEditor.goto(courseId);
    }

    // Try to find and use image component
    const imageOpened = await courseEditor.openFirstImageComponent();
    if (!imageOpened) {
      test.skip();
      return;
    }

    await courseEditor.fillImagePrompt('A simple test image');
    await courseEditor.clickGenerateImage();

    // Wait a bit for the API call
    await page.waitForTimeout(10000);

    // Log all captured errors
    console.log('\n========== CAPTURED API ERRORS ==========');
    for (const error of apiErrors) {
      console.log(`\nURL: ${error.url}`);
      console.log(`Status: ${error.status}`);
      console.log(`Body: ${error.body}`);
    }
    console.log('==========================================\n');

    await takeScreenshot(page, 'api-error-capture', 'API error capture');
  });
});
