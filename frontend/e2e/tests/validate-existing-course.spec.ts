/**
 * Validate Existing Course Quality
 *
 * Quick test to validate lesson quality on an existing course.
 * Used to capture current broken behavior before applying fixes.
 */
import { test, expect } from '../fixtures/test-base';
import { PreviewPage } from '../pages';
import { takeScreenshot } from '../helpers';

// The broken course from the user's report
const BROKEN_COURSE_ID = '42637379-ef90-4f4c-b765-2c098f8aeef8';

test.describe('Validate Existing Course Quality', () => {
  test('should capture current lesson quality issues', async ({ loggedPage: page }) => {
    console.log('\n========== EXISTING COURSE QUALITY VALIDATION ==========\n');

    // Track page errors
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
      console.error(`[PAGE_ERROR] ${error.message}`);
    });

    // Navigate to course preview
    const preview = new PreviewPage(page);
    await preview.goto(BROKEN_COURSE_ID);
    await preview.screenshot('existing-01-preview', 'Course preview loaded');

    const lessonCount = await preview.getLessonCount();
    console.log(`Total lessons: ${lessonCount}`);

    const qualityIssues: string[] = [];
    const lessonsToCheck = Math.min(lessonCount, 12); // Check first 12 lessons

    // Use Next button to navigate - more reliable than sidebar
    for (let i = 0; i < lessonsToCheck; i++) {
      console.log(`\n--- Lesson ${i + 1}/${lessonsToCheck} ---`);

      if (i > 0) {
        // Click Next button to go to next lesson
        const nextBtn = page.getByRole('button', { name: /Next/i });
        if (await nextBtn.isVisible()) {
          await nextBtn.click();
          await page.waitForTimeout(1500);
        }
      }
      await page.waitForTimeout(500);

      const title = await preview.getLessonTitle();
      console.log(`Title: ${title}`);

      const counts = await preview.countComponents();
      console.log(`Components: heading=${counts.heading}, text=${counts.text}, image=${counts.image}, quiz=${counts.quiz}, callout=${counts.callout}, list=${counts.list}`);

      // Validate minimum requirements
      if (counts.heading < 1) {
        qualityIssues.push(`Lesson ${i + 1} "${title}": NO HEADING`);
      }
      if (counts.text < 1) {
        qualityIssues.push(`Lesson ${i + 1} "${title}": NO TEXT CONTENT`);
      }
      if (counts.quiz < 1) {
        qualityIssues.push(`Lesson ${i + 1} "${title}": NO QUIZ`);
      }

      // Check for consecutive images (the main bug)
      const hasStackedImages = await preview.hasConsecutiveImages(3);
      if (hasStackedImages) {
        qualityIssues.push(`Lesson ${i + 1} "${title}": 3+ CONSECUTIVE IMAGES`);
      }

      // Check if lesson is just images
      const total = counts.heading + counts.text + counts.quiz + counts.callout + counts.list;
      if (total === 0 && counts.image > 0) {
        qualityIssues.push(`Lesson ${i + 1} "${title}": ONLY IMAGES - NO EDUCATIONAL CONTENT`);
      }

      await preview.screenshot(`existing-lesson-${i + 1}`, `Lesson ${i + 1}: ${title}`);
    }

    // Final report
    console.log('\n========== QUALITY REPORT ==========');
    console.log(`Lessons checked: ${lessonsToCheck}`);
    console.log(`Quality issues found: ${qualityIssues.length}`);
    console.log(`Page errors: ${pageErrors.length}`);

    if (qualityIssues.length > 0) {
      console.log('\n--- ISSUES ---');
      qualityIssues.forEach((issue) => console.log(`  ❌ ${issue}`));
    } else {
      console.log('\n  ✅ All lessons meet quality standards');
    }
    console.log('=====================================\n');

    await takeScreenshot(page, 'existing-final', 'Validation complete');

    // Don't fail the test - we're capturing the current state
    // The issues will be logged for review
  });
});
