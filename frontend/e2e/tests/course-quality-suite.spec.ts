/**
 * Course Quality Suite - Two-Phase E2E Testing
 *
 * This suite has two phases:
 * 1. GENERATION: Create course through wizard, generate outline and lessons
 * 2. REVIEW: Navigate through each lesson, take screenshots, validate structure
 *
 * The course ID is stored between tests to allow separate runs or continuation.
 *
 * Run full suite: npx playwright test course-quality-suite --reporter=list
 * Run generation only: npx playwright test course-quality-suite -g "generate"
 * Run review only: npx playwright test course-quality-suite -g "review"
 */
import { test, expect } from '@playwright/test';
import { WizardPage, OutlinePage, PreviewPage } from '../pages';
import { takeScreenshot } from '../helpers';
import * as fs from 'fs';
import * as path from 'path';

// File to store course ID between test phases
const COURSE_ID_FILE = path.join(__dirname, '..', '.generated-course-id.json');

// Quality criteria for ILD review
const ILD_CRITERIA = {
  minHeadings: 1,
  minTextBlocks: 1,
  minQuizzes: 1,
  maxImages: 3,
  maxConsecutiveImages: 1,
  minComponentVariety: 3,
};

interface GeneratedCourse {
  courseId: string;
  courseName: string;
  timestamp: string;
  sectionCount: number;
  lessonCount: string;
}

interface LessonReview {
  index: number;
  title: string;
  components: Record<string, number>;
  violations: string[];
  listStyles: string[];
  hasStatement: boolean;
  hasCallout: boolean;
  hasAccordionList: boolean;
}

// Helper to save course data
function saveCourseData(data: GeneratedCourse): void {
  fs.writeFileSync(COURSE_ID_FILE, JSON.stringify(data, null, 2));
  console.log(`Course data saved to ${COURSE_ID_FILE}`);
}

// Helper to load course data
function loadCourseData(): GeneratedCourse | null {
  try {
    if (fs.existsSync(COURSE_ID_FILE)) {
      const data = JSON.parse(fs.readFileSync(COURSE_ID_FILE, 'utf-8'));
      console.log(`Loaded course: ${data.courseName} (${data.courseId})`);
      return data;
    }
  } catch (e) {
    console.error('Failed to load course data:', e);
  }
  return null;
}

test.describe.serial('Course Quality Suite', () => {
  test.setTimeout(900000); // 15 minutes for the full suite

  // ========== PHASE 1: COURSE GENERATION ==========
  test('Phase 1: Generate course outline and lessons', async ({ page }) => {
    console.log('\n' + '='.repeat(70));
    console.log('PHASE 1: COURSE GENERATION');
    console.log('='.repeat(70) + '\n');

    // Setup logging
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.text().includes('ERROR')) {
        console.log(`[CONSOLE] ${msg.text()}`);
      }
    });
    page.on('pageerror', (error) => console.error(`[PAGE_ERROR] ${error.message}`));

    const wizard = new WizardPage(page);
    const courseName = 'Sales Enablement Fundamentals';

    // Step 1: Navigate to wizard
    console.log('--- Step 1: Starting Course Wizard ---');
    await wizard.goto();
    await takeScreenshot(page, 'gen-01-wizard-start', 'Wizard start');

    // Step 2: Complete wizard
    console.log(`--- Step 2: Creating course "${courseName}" ---`);
    const success = await wizard.completeWizard({
      courseName,
      desiredOutcomes:
        'Target audience is new sales representatives at B2B software companies. Cover prospecting, discovery calls, objection handling, and closing techniques. Include real-world scenarios.',
    });

    expect(success).toBe(true);

    // Extract courseId from editor URL after wizard completion
    const editorUrl = await wizard.clickOpenInEditor();
    const courseId = editorUrl.match(/\/course\/([^/]+)\//)?.[1] ?? '';
    console.log(`Course created with ID: ${courseId}`);
    await takeScreenshot(page, 'gen-02-wizard-complete', 'Wizard completed');

    // Step 3: Review outline
    console.log('--- Step 3: Reviewing Outline ---');
    const outline = new OutlinePage(page);
    await takeScreenshot(page, 'gen-03-outline', 'Course outline');

    const sectionCount = await outline.getSectionCount();
    const lessonInfo = await outline.getTotalLessonCount();
    console.log(`Outline: ${sectionCount} sections, ${lessonInfo}`);

    // Step 4: Generate lessons
    console.log('--- Step 4: Starting Lesson Generation ---');
    await outline.clickGenerateLessons();
    await outline.waitForSuccessModal();
    await takeScreenshot(page, 'gen-04-generation-started', 'Lesson generation started');
    await outline.dismissSuccessModal();

    // Step 5: Wait for lessons to generate
    console.log('--- Step 5: Waiting for Lessons (up to 5 min) ---');
    const preview = new PreviewPage(page);
    await preview.goto(courseId);

    let lessonsReady = false;
    let totalLessons = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
      totalLessons = await preview.getLessonCount();
      console.log(`Poll ${attempt + 1}/60: ${totalLessons} lessons available`);

      if (totalLessons > 0) {
        lessonsReady = true;
        console.log(`\nLessons ready! Total: ${totalLessons}`);
        break;
      }

      await page.waitForTimeout(5000);
      await page.reload();
    }

    expect(lessonsReady).toBeTruthy();
    await takeScreenshot(page, 'gen-05-lessons-ready', 'All lessons generated');

    // Save course data for Phase 2
    saveCourseData({
      courseId,
      courseName,
      timestamp: new Date().toISOString(),
      sectionCount,
      lessonCount: lessonInfo,
    });

    console.log('\n' + '='.repeat(70));
    console.log('PHASE 1 COMPLETE - Course generated and saved');
    console.log('='.repeat(70) + '\n');
  });

  // ========== PHASE 2: LESSON REVIEW ==========
  test('Phase 2: Review all lessons and validate structure', async ({ page }) => {
    console.log('\n' + '='.repeat(70));
    console.log('PHASE 2: LESSON STRUCTURE REVIEW');
    console.log('='.repeat(70) + '\n');

    // Load course data from Phase 1
    const courseData = loadCourseData();
    expect(courseData).toBeTruthy();
    if (!courseData) throw new Error('No course data found. Run Phase 1 first.');

    const { courseId, courseName } = courseData;
    console.log(`Reviewing course: "${courseName}" (${courseId})\n`);

    // Setup logging
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[ERROR] ${msg.text()}`);
      }
    });

    // Navigate to preview
    const preview = new PreviewPage(page);
    await preview.goto(courseId);
    await page.waitForTimeout(2000);

    const totalLessons = await preview.getLessonCount();
    console.log(`Total lessons to review: ${totalLessons}\n`);

    const lessonReviews: LessonReview[] = [];
    const qualitySummary = {
      totalLessons,
      passedLessons: 0,
      failedLessons: 0,
      totalViolations: 0,
      accordionListCount: 0,
      bulletedListCount: 0,
      statementCount: 0,
      calloutCount: 0,
    };

    // Review each lesson
    for (let i = 0; i < totalLessons; i++) {
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`LESSON ${i + 1}/${totalLessons}`);
      console.log('─'.repeat(50));

      // Navigate to lesson
      await preview.selectLesson(i);
      await page.waitForTimeout(1500);

      // Get lesson info
      const title = await preview.getLessonTitle();
      console.log(`Title: "${title}"`);

      // Take screenshot
      const screenshotName = `review-${String(i + 1).padStart(2, '0')}-${title
        .slice(0, 25)
        .replace(/[^a-zA-Z0-9]/g, '-')}`;
      await takeScreenshot(page, screenshotName, `Lesson ${i + 1}: ${title}`);

      // Count components
      const counts = await preview.countComponents();
      console.log(
        `Components: heading=${counts.heading}, text=${counts.text}, list=${counts.list}, ` +
          `statement=${counts.statement}, callout=${counts.callout}, image=${counts.image}, quiz=${counts.quiz}`
      );

      // Check list styles (look for accordion vs bulleted)
      const listStyles = await page.evaluate(() => {
        const styles: string[] = [];
        // Check for accordion indicators
        const accordions = document.querySelectorAll('[data-accordion], .accordion, [class*="accordion"]');
        if (accordions.length > 0) styles.push('accordion');
        // Check for bulleted lists
        const bullets = document.querySelectorAll('ul.bulleted, [data-style="bulleted"], ul:not([class])');
        if (bullets.length > 0) styles.push('bulleted');
        return styles;
      });

      // Check for specific components
      const hasStatement = counts.statement > 0;
      const hasCallout = counts.callout > 0;
      const hasAccordionList = listStyles.includes('accordion');

      if (hasStatement) qualitySummary.statementCount++;
      if (hasCallout) qualitySummary.calloutCount++;
      if (hasAccordionList) qualitySummary.accordionListCount++;
      if (listStyles.includes('bulleted')) qualitySummary.bulletedListCount++;

      // Validate against criteria
      const violations: string[] = [];

      if (counts.heading < ILD_CRITERIA.minHeadings) {
        violations.push(`Missing heading (found ${counts.heading})`);
      }
      if (counts.text < ILD_CRITERIA.minTextBlocks) {
        violations.push(`Missing text content (found ${counts.text})`);
      }
      if (counts.quiz < ILD_CRITERIA.minQuizzes) {
        violations.push(`Missing quiz (found ${counts.quiz})`);
      }
      if (counts.image > ILD_CRITERIA.maxImages) {
        violations.push(`Too many images (found ${counts.image}, max ${ILD_CRITERIA.maxImages})`);
      }

      // Check for consecutive images
      const hasConsecutiveImages = await preview.hasConsecutiveImages(2);
      if (hasConsecutiveImages) {
        violations.push('CRITICAL: 2+ consecutive images');
      }

      // Check component variety
      const varietyCount = Object.values(counts).filter((v) => v > 0).length;
      if (varietyCount < ILD_CRITERIA.minComponentVariety) {
        violations.push(`Low variety (${varietyCount} types, need ${ILD_CRITERIA.minComponentVariety})`);
      }

      // Log results
      if (violations.length > 0) {
        console.log('VIOLATIONS:');
        violations.forEach((v) => console.log(`  ❌ ${v}`));
        qualitySummary.failedLessons++;
        qualitySummary.totalViolations += violations.length;
      } else {
        console.log('✅ PASSED');
        qualitySummary.passedLessons++;
      }

      lessonReviews.push({
        index: i,
        title,
        components: counts,
        violations,
        listStyles,
        hasStatement,
        hasCallout,
        hasAccordionList,
      });
    }

    // Final Report
    console.log('\n' + '='.repeat(70));
    console.log('QUALITY REVIEW REPORT');
    console.log('='.repeat(70));
    console.log(`Course: ${courseName}`);
    console.log(`Total Lessons: ${qualitySummary.totalLessons}`);
    console.log(`Passed: ${qualitySummary.passedLessons}`);
    console.log(`Failed: ${qualitySummary.failedLessons}`);
    console.log(`Total Violations: ${qualitySummary.totalViolations}`);
    console.log('');
    console.log('Component Usage:');
    console.log(`  Statements: ${qualitySummary.statementCount} lessons`);
    console.log(`  Callouts: ${qualitySummary.calloutCount} lessons`);
    console.log(`  Accordion Lists: ${qualitySummary.accordionListCount} lessons`);
    console.log(`  Bulleted Lists: ${qualitySummary.bulletedListCount} lessons`);
    console.log('='.repeat(70) + '\n');

    // Take final screenshot
    await takeScreenshot(page, 'review-final', 'Review complete');

    // Assertions
    const criticalViolations = lessonReviews.filter((r) =>
      r.violations.some((v) => v.includes('CRITICAL'))
    );

    if (criticalViolations.length > 0) {
      console.error('\nCRITICAL ISSUES FOUND:');
      criticalViolations.forEach((r) => {
        console.error(`  Lesson ${r.index + 1}: ${r.title}`);
        r.violations
          .filter((v) => v.includes('CRITICAL'))
          .forEach((v) => console.error(`    - ${v}`));
      });
    }

    expect(criticalViolations.length).toBe(0);
  });
});
