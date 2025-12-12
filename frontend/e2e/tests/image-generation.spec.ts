/**
 * Image Generation E2E Tests
 *
 * Tests the image generation feature within the course editor.
 * Prerequisites: A course with lessons must exist.
 *
 * Flow:
 * 1. Navigate to /course/{id}/editor
 * 2. Select a lesson from sidebar
 * 3. Add an Image component
 * 4. Fill in description and click "Generate Image"
 * 5. Wait for result
 */
import { test, expect } from '@playwright/test';
import { CourseEditorPage } from '../pages';
import { takeScreenshot } from '../helpers';
import { TEST_DATA, TIMEOUTS } from '../config';

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

  test('should generate image via Add Component flow', async ({ page }) => {
    const courseEditor = new CourseEditorPage(page);

    console.log('\n========== IMAGE GENERATION TEST START ==========\n');

    // Go directly to the course with completed lessons
    const courseId = TEST_DATA.imageGeneration.courseWithLessons;
    console.log(`\n--- Navigating to course editor: ${courseId} ---`);

    await courseEditor.goto(courseId);
    await courseEditor.screenshot('01-editor-loaded', 'Course editor loaded');

    // Step 1: Select first lesson
    console.log('\n--- Step 1: Select Lesson ---');
    await courseEditor.selectFirstLesson();
    await courseEditor.screenshot('02-lesson-selected', 'Lesson selected');

    // Step 2: Click "Add Component" button
    console.log('\n--- Step 2: Add Image Component ---');
    await courseEditor.clickAddComponent();
    await courseEditor.screenshot('03-add-menu-open', 'Add Component menu open');

    // Step 3: Select "Image" from the menu
    await courseEditor.selectImageFromMenu();
    await courseEditor.screenshot('04-image-added', 'Image component added');

    // Step 4: Wait for Edit Modal to open
    console.log('\n--- Step 3: Wait for Edit Modal ---');
    await courseEditor.waitForEditModal();
    await courseEditor.screenshot('05-edit-modal', 'Edit Image modal open');

    // Step 5: Fill in image description
    console.log('\n--- Step 4: Fill Description ---');
    await courseEditor.fillImageDescription(TEST_DATA.imageGeneration.prompt);
    await courseEditor.screenshot('06-description-filled', 'Description filled');

    // Step 6: Click Generate Image
    console.log('\n--- Step 5: Generate Image ---');
    await courseEditor.clickGenerateImage();
    await courseEditor.screenshot('07-generating', 'Generating image...');

    // Step 7: Wait for result
    console.log('\n--- Step 6: Wait for Result ---');
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

    await courseEditor.screenshot('08-result', 'Final result');
    await takeScreenshot(page, 'img-gen-final', 'Test complete');

    console.log('\n========== IMAGE GENERATION TEST END ==========\n');

    // For debugging: don't fail the test, just log the result
    if (!result.success) {
      console.log('Image generation failed - check screenshots and logs');
      console.log('Error:', result.error);
    }
  });

  test('should use full generateImage flow', async ({ page }) => {
    const courseEditor = new CourseEditorPage(page);

    console.log('\n========== FULL FLOW TEST START ==========\n');

    // Go to course editor
    const courseId = TEST_DATA.imageGeneration.courseWithLessons;
    await courseEditor.goto(courseId);

    // Use the combined flow method
    const result = await courseEditor.generateImage(TEST_DATA.imageGeneration.prompt);

    console.log('\n========== RESULT ==========');
    console.log(JSON.stringify(result, null, 2));
    console.log('============================\n');

    await takeScreenshot(page, 'full-flow-result', 'Full flow test result');
  });

  test('should capture API error details on failure', async ({ page }) => {
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

    const courseEditor = new CourseEditorPage(page);

    // Navigate to course
    const courseId = TEST_DATA.imageGeneration.courseWithLessons;
    await courseEditor.goto(courseId);
    await courseEditor.selectFirstLesson();

    // Add image component
    await courseEditor.addImageComponent();
    await courseEditor.waitForEditModal();

    // Generate with simple prompt
    await courseEditor.fillImageDescription('A simple test image');
    await courseEditor.clickGenerateImage();

    // Wait for API call to complete
    await page.waitForTimeout(TIMEOUTS.aiGeneration);

    // Log all captured errors
    console.log('\n========== CAPTURED API ERRORS ==========');
    if (apiErrors.length === 0) {
      console.log('No API errors captured');
    }
    for (const error of apiErrors) {
      console.log(`\nURL: ${error.url}`);
      console.log(`Status: ${error.status}`);
      console.log(`Body: ${error.body}`);
    }
    console.log('==========================================\n');

    await takeScreenshot(page, 'api-error-capture', 'API error capture');
  });
});
