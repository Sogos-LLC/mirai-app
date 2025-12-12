import { test, expect } from '@playwright/test';
import { OutlinePage } from '../pages';
import { takeScreenshot } from '../helpers';

/**
 * Tests for the course outline approval flow.
 *
 * Prerequisites:
 * - A course has been created through the wizard
 * - The outline generation job has completed
 * - The course is in 'outline_ready' status
 *
 * Flow:
 * 1. Navigate to /course/{courseId}/outline
 * 2. Review the outline (sections and lessons displayed)
 * 3. Click "Approve & Generate Lessons"
 * 4. Success modal appears, click "Got it!"
 * 5. User is redirected to dashboard
 * 6. Background job generates all lesson content (~5 min)
 * 7. Course appears in content library when ready
 */

test.describe('Course Outline Approval', () => {
  // The courseId from the last wizard test run
  // We'll get this from the database or use the known test course
  const COURSE_ID = '017e4b49-562b-46df-bd34-138ff7e00ba0';

  test('should display outline and allow approval', async ({ page }) => {
    console.log('\n========== OUTLINE APPROVAL TEST START ==========\n');

    // Set up console logging
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[CONSOLE_ERROR] ${msg.text()}`);
      }
    });

    const outlinePage = new OutlinePage(page);

    // Navigate to outline page
    await outlinePage.goto(COURSE_ID);

    // Wait for outline to load
    await outlinePage.waitForOutlineLoaded();

    // Verify outline content
    const sectionCount = await outlinePage.getSectionCount();
    console.log(`Found ${sectionCount} sections`);
    expect(sectionCount).toBeGreaterThan(0);

    // Take screenshot of the full outline
    await takeScreenshot(page, 'outline-full', 'Full outline view');

    // Click generate button
    await outlinePage.clickGenerateLessons();

    // Wait for success modal
    await outlinePage.waitForSuccessModal();

    // Dismiss modal
    const dismissed = await outlinePage.dismissSuccessModal();
    expect(dismissed).toBe(true);

    console.log('\n========== OUTLINE APPROVAL TEST END ==========\n');
  });

  test.skip('should poll for course in content library after approval', async ({ page }) => {
    // This test would poll content library waiting for the course to appear
    // Skipped because course generation takes ~5 minutes
    // In real CI, we'd run this as a separate scheduled test

    console.log('\n========== CONTENT LIBRARY POLL TEST START ==========\n');

    // Wait for course to appear (up to 10 minutes)
    const maxAttempts = 100; // 100 * 6s = 10 minutes
    let found = false;

    for (let i = 0; i < maxAttempts && !found; i++) {
      await page.goto('/content-library');
      await page.waitForTimeout(2000);

      // Look for the course card
      const courseCard = page.locator('[data-testid="course-card"]').first();
      if (await courseCard.isVisible().catch(() => false)) {
        found = true;
        console.log(`Course found after ${i + 1} attempts`);
        await takeScreenshot(page, 'course-found', 'Course appeared in library');
      } else {
        console.log(`Attempt ${i + 1}/${maxAttempts}: Course not yet in library`);
        await page.waitForTimeout(6000);
      }
    }

    expect(found).toBe(true);
    console.log('\n========== CONTENT LIBRARY POLL TEST END ==========\n');
  });
});
