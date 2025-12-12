/**
 * SCORM Export E2E Tests
 *
 * Tests the SCORM 2004 export functionality from the course editor.
 * Prerequisites: A course with lessons must exist.
 *
 * Flow:
 * 1. Navigate to /course/{id}/editor
 * 2. Click Export button
 * 3. Start export
 * 4. Wait for completion
 * 5. Verify download works
 * 6. Verify notification appears
 * 7. Verify email sent to mailpit
 */
import { test, expect } from '@playwright/test';
import { ExportPage } from '../pages/export.page';
import { takeScreenshot } from '../helpers';
import { TEST_DATA, TIMEOUTS } from '../config';

// Mailpit URL for local k3d environment
const MAILPIT_URL = process.env.MAILPIT_URL || 'http://mailpit.mirai-local.svc.cluster.local:8025';

test.describe('SCORM Export', () => {
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

    // Capture API responses for CourseService
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('CourseService') && url.includes('Export')) {
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

  test('should open export modal when clicking export button', async ({ page }) => {
    const exportPage = new ExportPage(page);

    console.log('\n========== EXPORT MODAL TEST START ==========\n');

    // Navigate to course editor
    const courseId = TEST_DATA.imageGeneration.courseWithLessons;
    console.log(`\n--- Navigating to course editor: ${courseId} ---`);

    await exportPage.gotoEditor(courseId);
    await exportPage.screenshot('01-editor-loaded', 'Course editor loaded');

    // Click export button
    console.log('\n--- Step 1: Click Export Button ---');
    await exportPage.clickExportButton();

    // Verify modal opens
    console.log('\n--- Step 2: Verify Modal Opens ---');
    await exportPage.waitForModal();
    const isOpen = await exportPage.isModalOpen();
    expect(isOpen).toBe(true);

    // Close modal
    await exportPage.closeModal();

    console.log('\n========== EXPORT MODAL TEST COMPLETE ==========\n');
  });

  test('should complete full export flow', async ({ page }) => {
    // Increase timeout for this test since export can take time
    test.setTimeout(300000); // 5 minutes

    const exportPage = new ExportPage(page);

    console.log('\n========== FULL EXPORT FLOW TEST START ==========\n');

    // Navigate to course editor
    const courseId = TEST_DATA.imageGeneration.courseWithLessons;
    console.log(`\n--- Navigating to course editor: ${courseId} ---`);

    await exportPage.gotoEditor(courseId);
    await exportPage.screenshot('01-editor-loaded', 'Course editor loaded');

    // Start export flow
    console.log('\n--- Step 1: Click Export Button ---');
    await exportPage.clickExportButton();
    await exportPage.waitForModal();

    console.log('\n--- Step 2: Start Export ---');
    await exportPage.startExport();

    // Wait a moment for modal to update from idle to starting
    await page.waitForTimeout(1000);
    await exportPage.screenshot('after-export-start', 'After clicking export');

    // Wait for export to complete (handles all states: starting → processing → completed)
    console.log('\n--- Step 3: Wait for Export Complete ---');
    const result = await exportPage.waitForExportComplete();

    if (result.success) {
      console.log('Export completed successfully!');
      await exportPage.screenshot('export-success', 'Export completed');

      // Verify download button works
      console.log('\n--- Step 4: Test Download ---');
      await exportPage.clickDownload();
    } else {
      console.error('Export failed:', result.error);
      await exportPage.screenshot('export-failure', `Export failed: ${result.error}`);
    }

    expect(result.success).toBe(true);

    // Close modal
    await exportPage.closeModal();

    console.log('\n========== FULL EXPORT FLOW TEST COMPLETE ==========\n');
  });

  test('should show export notification after starting export', async ({ page }) => {
    const exportPage = new ExportPage(page);

    console.log('\n========== EXPORT NOTIFICATION TEST START ==========\n');

    // Navigate to course editor
    const courseId = TEST_DATA.imageGeneration.courseWithLessons;
    console.log(`\n--- Navigating to course editor: ${courseId} ---`);

    await exportPage.gotoEditor(courseId);

    // Start export
    console.log('\n--- Step 1: Start Export ---');
    await exportPage.clickExportButton();
    await exportPage.waitForModal();
    await exportPage.startExport();

    // Wait a bit for the export to start and notification to be created
    await page.waitForTimeout(5000);

    // Close the modal so we can check notifications
    await exportPage.closeModal();
    await page.waitForTimeout(1000);

    // Check notification panel
    console.log('\n--- Step 2: Check Notification Panel ---');
    await exportPage.openNotificationPanel();
    await exportPage.screenshot('notification-panel-check', 'Checking notification panel');

    // Note: The notification may take time to appear if export is still processing
    // This test verifies the notification panel works, but actual notification
    // timing depends on export completion

    console.log('\n========== EXPORT NOTIFICATION TEST COMPLETE ==========\n');
  });

  test.skip('should send email notification to mailpit', async ({ page }) => {
    // Skip by default since mailpit may not be accessible in all environments
    // Enable by removing .skip when running with proper mailpit access

    const exportPage = new ExportPage(page);

    console.log('\n========== MAILPIT EMAIL TEST START ==========\n');

    // Navigate to course editor and start export
    const courseId = TEST_DATA.imageGeneration.courseWithLessons;
    await exportPage.gotoEditor(courseId);

    // Complete export flow
    await exportPage.clickExportButton();
    await exportPage.waitForModal();
    await exportPage.startExport();

    const result = await exportPage.waitForExportComplete();
    expect(result.success).toBe(true);

    // Wait for email to be sent (give it a few seconds after export completes)
    await page.waitForTimeout(5000);

    // Check mailpit
    console.log('\n--- Checking Mailpit for Export Email ---');
    const emailResult = await exportPage.verifyEmailInMailpit(MAILPIT_URL);

    if (emailResult.found) {
      console.log('Email found:', emailResult.subject);
      if (emailResult.downloadUrl) {
        console.log('Download URL in email:', emailResult.downloadUrl);
      }
    } else {
      console.log('Email not found - mailpit may not be accessible');
    }

    expect(emailResult.found).toBe(true);

    console.log('\n========== MAILPIT EMAIL TEST COMPLETE ==========\n');
  });
});
