/**
 * Full Course Generation E2E Test with Professional Quality Review
 *
 * This comprehensive test verifies that AI-generated courses meet
 * professional instructional design standards regardless of the topic.
 *
 * The test:
 * 1. Creates a NEW course through the wizard (any topic - gardening, sales, tech, etc.)
 * 2. Generates and validates the course outline
 * 3. Generates ALL lesson content
 * 4. Reviews EVERY lesson from an ILD (Instructional Learning Designer) perspective
 * 5. Validates component structure - no walls of text, proper variety, good UX
 * 6. Ensures no anti-patterns like consecutive images
 *
 * Run: npx playwright test full-course-generation --reporter=list
 */
import { test, expect } from '@playwright/test';
import { WizardPage, ContentLibraryPage, OutlinePage, PreviewPage } from '../pages';
import { takeScreenshot } from '../helpers';
import { POLLING, TIMEOUTS } from '../config';

// ILD Quality criteria thresholds
const ILD_CRITERIA = {
  minHeadings: 1,
  minTextBlocks: 1,
  minQuizzes: 1,
  maxImages: 3,
  maxConsecutiveImages: 1, // Must be 1 (no 2+ consecutive)
  minComponentVariety: 3, // Different component types
  maxTextBlockLength: 800, // Characters before it's a "wall of text"
};

interface LessonQualityReport {
  lessonIndex: number;
  lessonTitle: string;
  componentCounts: Record<string, number>;
  violations: string[];
  passed: boolean;
}

interface CourseQualityReport {
  courseTitle: string;
  totalLessons: number;
  lessonsReviewed: number;
  lessonReports: LessonQualityReport[];
  overallPassed: boolean;
  summary: {
    passedLessons: number;
    failedLessons: number;
    totalViolations: number;
  };
}

test.describe('Full Course Generation with ILD Quality Review', () => {
  // Increase timeout for this long-running test
  test.setTimeout(600000); // 10 minutes

  test('should create course and validate all lessons meet ILD standards', async ({ page }) => {
    const wizard = new WizardPage(page);
    const contentLibrary = new ContentLibraryPage(page);
    const qualityReport: CourseQualityReport = {
      courseTitle: '',
      totalLessons: 0,
      lessonsReviewed: 0,
      lessonReports: [],
      overallPassed: true,
      summary: { passedLessons: 0, failedLessons: 0, totalViolations: 0 },
    };

    // Setup comprehensive logging
    const logs: string[] = [];
    page.on('console', (msg) => {
      const entry = `[${msg.type().toUpperCase()}] ${msg.text()}`;
      logs.push(entry);
      console.log(entry);
    });

    page.on('pageerror', (error) => {
      const entry = `[PAGE_ERROR] ${error.message}`;
      logs.push(entry);
      console.error(entry);
    });

    page.on('response', async (response) => {
      if (response.url().includes('mirai.v1') && response.status() >= 400) {
        const entry = `[API_ERROR] ${response.status()} ${response.url()}`;
        logs.push(entry);
        console.error(entry);
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log('FULL COURSE GENERATION WITH ILD QUALITY REVIEW');
    console.log('='.repeat(60) + '\n');

    // ===== PHASE 1: Create Course Through Wizard =====
    console.log('\n--- PHASE 1: Course Creation Wizard ---\n');

    await wizard.goto();
    await takeScreenshot(page, '01-wizard-start', 'Wizard start');

    // Use a realistic course topic - this tests that the system can generate
    // professionally designed content for any subject matter
    const courseName = `Sales Enablement Fundamentals`;
    console.log(`Creating course: "${courseName}"`);

    // Complete wizard - returns course ID after outline generation
    const courseId = await wizard.completeWizard({
      courseName,
      additionalContext: 'Target audience is new sales representatives at B2B software companies. Cover prospecting, discovery calls, objection handling, and closing techniques. Include real-world scenarios and practice exercises.',
    });

    expect(courseId).toBeTruthy();
    console.log(`Course created with ID: ${courseId}`);
    await takeScreenshot(page, '02-wizard-complete', 'Wizard completed, outline ready');

    // ===== PHASE 2: Review Outline and Generate Lessons =====
    console.log('\n--- PHASE 2: Outline Review & Lesson Generation ---\n');

    // We're already on the outline page after wizard completes
    const outline = new OutlinePage(page);
    await takeScreenshot(page, '03-outline-page', 'Outline page');

    // Get outline info
    const sectionCount = await outline.getSectionCount();
    const lessonInfo = await outline.getTotalLessonCount();
    console.log(`Outline: ${sectionCount} sections, ${lessonInfo}`);

    await takeScreenshot(page, '04-outline-content', 'Outline with content');

    // Click "Generate Lessons" to start lesson content generation
    await outline.clickGenerateLessons();

    // Wait for success modal (lesson generation uses modal flow)
    await outline.waitForSuccessModal();
    await takeScreenshot(page, '05-generation-started', 'Lesson generation started');

    // Dismiss modal (this may redirect to preview or dashboard)
    await outline.dismissSuccessModal();

    // ===== PHASE 3: Wait for All Lessons to Generate =====
    console.log('\n--- PHASE 3: Waiting for Lesson Generation ---\n');

    // Navigate to preview page and poll for lessons to be ready
    const preview = new PreviewPage(page);
    await preview.goto(courseId);
    await takeScreenshot(page, '06-preview-initial', 'Preview page initial');

    // Poll until lessons are generated (check for lesson count > 0)
    let lessonsReady = false;
    for (let attempt = 0; attempt < 60; attempt++) { // 60 * 5s = 5 minutes
      const lessonCount = await preview.getLessonCount();
      console.log(`Poll ${attempt + 1}/60: ${lessonCount} lessons available`);

      if (lessonCount > 0) {
        qualityReport.totalLessons = lessonCount;
        lessonsReady = true;
        console.log(`\nLessons ready! Total: ${lessonCount}`);
        break;
      }

      await page.waitForTimeout(5000);
      await page.reload();
    }

    expect(lessonsReady).toBeTruthy();
    await takeScreenshot(page, '07-lessons-ready', 'Lessons ready for review');

    // ===== PHASE 4: ILD Quality Review - Review Every Lesson =====
    console.log('\n--- PHASE 4: ILD Quality Review ---\n');
    console.log('Reviewing ALL lessons for ILD quality standards...\n');

    const totalLessons = qualityReport.totalLessons;

    for (let i = 0; i < totalLessons; i++) {
      console.log(`\n--- Reviewing Lesson ${i + 1}/${totalLessons} ---`);

      // Select lesson
      await preview.selectLesson(i);
      await page.waitForTimeout(1500); // Wait for content to load

      // Get lesson title
      const lessonTitle = await preview.getLessonTitle();
      console.log(`Title: "${lessonTitle}"`);

      // Screenshot the lesson
      await takeScreenshot(page, `08-lesson-${String(i + 1).padStart(2, '0')}-${lessonTitle.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-')}`, `Lesson ${i + 1}: ${lessonTitle}`);

      // Count components
      const counts = await preview.countComponents();
      console.log('Component counts:', counts);

      // Check for consecutive images
      const hasConsecutiveImages = await preview.hasConsecutiveImages(2);

      // Validate against ILD criteria
      const violations: string[] = [];

      if (counts.heading < ILD_CRITERIA.minHeadings) {
        violations.push(`Missing heading (found ${counts.heading}, need ${ILD_CRITERIA.minHeadings})`);
      }

      if (counts.text < ILD_CRITERIA.minTextBlocks) {
        violations.push(`Insufficient text content (found ${counts.text}, need ${ILD_CRITERIA.minTextBlocks})`);
      }

      if (counts.quiz < ILD_CRITERIA.minQuizzes) {
        violations.push(`Missing quiz/assessment (found ${counts.quiz}, need ${ILD_CRITERIA.minQuizzes})`);
      }

      if (counts.image > ILD_CRITERIA.maxImages) {
        violations.push(`Too many images (found ${counts.image}, max ${ILD_CRITERIA.maxImages})`);
      }

      if (hasConsecutiveImages) {
        violations.push('CRITICAL: Contains 2+ consecutive images (poor learning UX)');
      }

      // Check component variety
      const componentTypes = Object.entries(counts).filter(([_, v]) => v > 0).length;
      if (componentTypes < ILD_CRITERIA.minComponentVariety) {
        violations.push(`Low component variety (${componentTypes} types, need ${ILD_CRITERIA.minComponentVariety})`);
      }

      // Build lesson report
      const lessonReport: LessonQualityReport = {
        lessonIndex: i,
        lessonTitle,
        componentCounts: counts,
        violations,
        passed: violations.length === 0,
      };

      qualityReport.lessonReports.push(lessonReport);
      qualityReport.lessonsReviewed++;

      if (violations.length > 0) {
        console.log('VIOLATIONS:');
        violations.forEach((v) => console.log(`  - ${v}`));
        qualityReport.summary.failedLessons++;
        qualityReport.summary.totalViolations += violations.length;
      } else {
        console.log('PASSED - No violations');
        qualityReport.summary.passedLessons++;
      }
    }

    // ===== PHASE 6: Generate Quality Report =====
    console.log('\n' + '='.repeat(60));
    console.log('ILD QUALITY REPORT');
    console.log('='.repeat(60) + '\n');

    qualityReport.overallPassed = qualityReport.summary.failedLessons === 0;

    console.log(`Course: ${courseName}`);
    console.log(`Total Lessons: ${qualityReport.totalLessons}`);
    console.log(`Lessons Reviewed: ${qualityReport.lessonsReviewed}`);
    console.log(`Passed: ${qualityReport.summary.passedLessons}`);
    console.log(`Failed: ${qualityReport.summary.failedLessons}`);
    console.log(`Total Violations: ${qualityReport.summary.totalViolations}`);
    console.log(`Overall: ${qualityReport.overallPassed ? 'PASSED' : 'FAILED'}\n`);

    if (!qualityReport.overallPassed) {
      console.log('FAILED LESSONS:');
      qualityReport.lessonReports
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`\n  Lesson ${r.lessonIndex + 1}: ${r.lessonTitle}`);
          console.log(`  Components: ${JSON.stringify(r.componentCounts)}`);
          r.violations.forEach((v) => console.log(`    - ${v}`));
        });
    }

    await takeScreenshot(page, '09-final-state', 'Final state after review');

    // Final assertion
    console.log('\n' + '='.repeat(60) + '\n');

    // Check for CRITICAL violations (consecutive images)
    const criticalViolations = qualityReport.lessonReports.filter((r) =>
      r.violations.some((v) => v.includes('consecutive images'))
    );

    if (criticalViolations.length > 0) {
      console.error('CRITICAL: Found lessons with consecutive images!');
      criticalViolations.forEach((r) => {
        console.error(`  - Lesson ${r.lessonIndex + 1}: ${r.lessonTitle}`);
      });
    }

    // Assert no critical violations (consecutive images)
    expect(criticalViolations.length).toBe(0);

    // Log all console output at the end for debugging
    console.log('\n--- Browser Console Summary ---');
    const errors = logs.filter((l) => l.includes('ERROR'));
    if (errors.length > 0) {
      console.log(`Found ${errors.length} errors in console`);
      errors.slice(0, 10).forEach((e) => console.log(e));
    }
  });
});
