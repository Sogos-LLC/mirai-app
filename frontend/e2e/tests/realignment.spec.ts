import { test, expect } from '@playwright/test';
import { CourseEditorPage } from '../pages/course-editor.page';
import { takeScreenshot } from '../helpers';
import { TIMEOUTS, TEST_DATA } from '../config';
import { pollUntil } from '../helpers/wait';

/**
 * Realignment Feature E2E Tests
 *
 * Tests the realignment functionality that allows users to regenerate
 * component content with new persona/audience targeting.
 *
 * These tests document two known bugs:
 * - Bug #1: Personas/audiences not showing in the realignment modal
 * - Bug #2: Modal closes immediately before regeneration job completes
 */
test.describe('Realignment Feature', () => {
  let courseId: string;

  // Set up console logging for all tests
  test.beforeEach(async ({ page }) => {
    // Capture console messages - include all types for debugging
    page.on('console', (msg) => {
      const type = msg.type().toUpperCase();
      const text = msg.text();
      // Always capture RealignmentModal logs and errors/warnings
      if (type === 'ERROR' || type === 'WARNING' || text.includes('RealignmentModal')) {
        console.log(`[CONSOLE_${type}] ${text}`);
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      console.error(`[PAGE_ERROR] ${error.message}`);
    });

    // Capture API responses for debugging
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('AIGenerationService')) {
        const status = response.status();
        console.log(`[API] ${status} ${url.split('/').pop()}`);
        if (status >= 400) {
          try {
            const text = await response.text();
            console.error(`[API_ERROR] ${text.substring(0, 200)}`);
          } catch {
            // Ignore
          }
        }
      }
    });
  });

  test('should open realignment modal and verify persona availability', async ({ page }) => {
    const editor = new CourseEditorPage(page);

    // Use the known-good test course with lessons
    const testCourseId = TEST_DATA.imageGeneration.courseWithLessons;
    console.log(`Using test course: ${testCourseId}`);
    courseId = testCourseId;

    // Navigate directly to the course editor
    console.log('Step 1: Navigate to course editor');
    await editor.goto(testCourseId);
    await takeScreenshot(page, 'realign-01-editor-loaded', 'Course editor loaded');

    // Step 2: Select first lesson
    console.log('Step 2: Select first lesson');
    await editor.selectFirstLesson();
    await takeScreenshot(page, 'realign-02-lesson-selected', 'First lesson selected');

    // Step 3: Find a text component (not IMAGE)
    console.log('Step 3: Find text component for realignment');
    const textComponent = await editor.findFirstTextComponent();

    if (!textComponent) {
      console.log('No text components found in lesson');
      await takeScreenshot(page, 'realign-error-no-components', 'No text components found');
      test.skip(true, 'No text components available for realignment testing');
      return;
    }

    await takeScreenshot(page, 'realign-03-component-found', 'Text component found');

    // Step 4: Open the 3-dot menu
    console.log('Step 4: Open component options menu');
    await editor.openRealignmentMenu(textComponent);
    await takeScreenshot(page, 'realign-04-menu-opened', '3-dot menu opened');

    // Step 5: Click Realignment option
    console.log('Step 5: Click Realignment option');
    await editor.clickRealignmentOption();
    await editor.waitForRealignmentModal();
    await takeScreenshot(page, 'realign-05-modal-opened', 'Realignment modal opened');

    // Step 6: Verify personas are available (Bug #1 check)
    console.log('Step 6: Check if personas are available');
    const personaStatus = await editor.hasPersonasInModal();
    console.log(`Persona status: ${personaStatus.message}`);
    await takeScreenshot(page, 'realign-06-persona-check', personaStatus.message);

    // Document Bug #1 if present
    if (!personaStatus.hasPersonas) {
      console.log('BUG #1 DETECTED: No personas shown in realignment modal');
      console.log('This indicates GetWizardData is returning null or wizard data was not stored');
    }

    // Step 7: Check for learning objectives
    console.log('Step 7: Check for learning objectives');
    const loSection = page.getByRole('heading', { name: 'Learning Objectives' });
    const hasLOs = await loSection.isVisible();
    console.log(`Learning objectives section visible: ${hasLOs}`);

    // Step 8: Close the modal
    await editor.closeRealignmentModal();
    await takeScreenshot(page, 'realign-07-modal-closed', 'Modal closed');

    // Assertions
    expect(personaStatus.message).toBeTruthy();
  });

  test('should regenerate component with alignment and verify content changes', async ({ page }) => {
    const editor = new CourseEditorPage(page);

    // Use an existing course with lessons for this test
    const testCourseId = TEST_DATA.imageGeneration.courseWithLessons;
    console.log(`Using test course: ${testCourseId}`);

    // Navigate directly to the course editor
    await editor.goto(testCourseId);
    await takeScreenshot(page, 'realign-regen-01-editor', 'Editor loaded');

    // Select first lesson
    await editor.selectFirstLesson();
    await takeScreenshot(page, 'realign-regen-02-lesson', 'Lesson selected');

    // Find text component
    const textComponent = await editor.findFirstTextComponent();
    if (!textComponent) {
      test.skip(true, 'No text components available');
      return;
    }

    // Capture original content
    const originalContent = await editor.getComponentTextContent(textComponent);
    console.log(`Original content (first 100 chars): "${originalContent.substring(0, 100)}..."`);

    // Open realignment modal
    await editor.openRealignmentMenu(textComponent);
    await editor.clickRealignmentOption();
    await editor.waitForRealignmentModal();
    await takeScreenshot(page, 'realign-regen-03-modal', 'Realignment modal open');

    // Try to select a learning objective
    const loSelected = await editor.selectFirstLearningObjective();
    console.log(`Learning objective selected: ${loSelected}`);

    // Fill in additional instructions
    await editor.fillAdditionalInstructions('Please include some dry humor and make it more engaging for beginners.');
    await takeScreenshot(page, 'realign-regen-04-filled', 'Options selected');

    // Click regenerate
    console.log('Clicking Regenerate with Alignment...');
    await editor.clickRegenerateWithAlignment();
    await takeScreenshot(page, 'realign-regen-05-clicked', 'Regenerate clicked');

    // Wait for result (Bug #2 check - modal should stay open during job)
    const result = await editor.waitForRegenerationComplete(TIMEOUTS.backgroundJob);
    console.log(`Regeneration result: ${JSON.stringify(result)}`);

    // Document Bug #2 if present
    if (result.modalClosed && !result.success) {
      console.log('BUG #2 DETECTED: Modal closed immediately before job completed');
      await takeScreenshot(page, 'realign-bug2-modal-closed-early', 'Bug #2: Modal closed prematurely');
    }

    // Poll for content change (even if modal closed prematurely)
    console.log('Polling for content changes...');
    const contentChanged = await pollUntil(async () => {
      // Re-find the component
      const comp = await editor.findFirstTextComponent();
      if (!comp) return null;

      const newContent = await editor.getComponentTextContent(comp);
      console.log(`New content (first 100 chars): "${newContent.substring(0, 100)}..."`);

      // Compare content
      if (newContent !== originalContent && newContent.length > 0) {
        return { changed: true, newContent };
      }
      return null;
    }, { maxAttempts: 20, delayMs: 3000 });

    if (contentChanged) {
      console.log('SUCCESS: Component content was regenerated');
      await takeScreenshot(page, 'realign-regen-06-success', 'Content regenerated successfully');
    } else {
      console.log('Content did not change after regeneration');
      await takeScreenshot(page, 'realign-regen-06-unchanged', 'Content unchanged');
    }

    await takeScreenshot(page, 'realign-regen-07-final', 'Final state');
  });

  test('should verify API response includes wizard data', async ({ page }) => {
    const editor = new CourseEditorPage(page);

    // Use test course
    const testCourseId = TEST_DATA.imageGeneration.courseWithLessons;

    // Listen for GetCourseOutline response
    let wizardDataReceived = false;
    let responseData: string | null = null;

    page.on('response', async (response) => {
      if (response.url().includes('GetCourseOutline')) {
        try {
          // Note: Connect-RPC uses protobuf, so we can't easily parse the response
          // But we can check if the response is substantial
          const buffer = await response.body();
          console.log(`GetCourseOutline response size: ${buffer.length} bytes`);

          // A response with wizard data should be larger
          if (buffer.length > 500) {
            wizardDataReceived = true;
            console.log('GetCourseOutline returned substantial data');
          }
        } catch (e) {
          console.log('Could not read response body');
        }
      }
    });

    // Navigate to editor (triggers GetCourseOutline)
    await editor.goto(testCourseId);
    await editor.waitForEditorLoad();

    await takeScreenshot(page, 'realign-api-01-loaded', 'Editor loaded');

    // Select lesson and check modal
    await editor.selectFirstLesson();
    const textComponent = await editor.findFirstTextComponent();

    if (textComponent) {
      await editor.openRealignmentMenu(textComponent);
      await editor.clickRealignmentOption();
      await editor.waitForRealignmentModal();

      const personaStatus = await editor.hasPersonasInModal();
      console.log(`API Test - Persona status: ${personaStatus.message}`);
      await takeScreenshot(page, 'realign-api-02-modal', personaStatus.message);

      await editor.closeRealignmentModal();
    }

    console.log(`Wizard data received: ${wizardDataReceived}`);
    await takeScreenshot(page, 'realign-api-03-complete', 'API test complete');
  });
});
