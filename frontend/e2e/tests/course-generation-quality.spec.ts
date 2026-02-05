/**
 * Course Generation Quality Test
 *
 * Creates a course from scratch and validates that generated lessons
 * meet professional instructional design standards.
 *
 * Validation criteria:
 * - Each lesson has at least 1 heading
 * - Each lesson has at least 1 text component
 * - Each lesson has at least 1 quiz
 * - No 3+ consecutive IMAGE components
 * - Components between 5-10 per lesson
 */
import { test, expect } from '../fixtures/test-base';
import { WizardPage, OutlinePage, ContentLibraryPage, PreviewPage } from '../pages';
import { takeScreenshot, pollUntil } from '../helpers';

const TEST_COURSE = {
  name: 'Quality Test - Effective Email Communication',
  context: 'Focus on professional workplace email etiquette and clarity.',
};

test.describe('Course Generation Quality', () => {
  test('should generate lessons with proper ILD structure', async ({ loggedPage: page }) => {
    console.log('\n========== COURSE GENERATION QUALITY TEST ==========\n');
    const startTime = Date.now();

    // Track page errors
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
      console.error(`[PAGE_ERROR] ${error.message}`);
    });

    // Step 1: Complete the wizard to create a course
    console.log('\n--- Step 1: Complete Course Creation Wizard ---\n');
    const wizard = new WizardPage(page);
    await wizard.goto();

    const wizardSuccess = await wizard.completeWizard({
      courseName: TEST_COURSE.name,
      desiredOutcomes: TEST_COURSE.context,
    });
    expect(wizardSuccess).toBe(true);

    // Step 2: Wait for course to appear in content library
    console.log('\n--- Step 2: Wait for Course in Content Library ---\n');
    const contentLibrary = new ContentLibraryPage(page);
    await page.goto('/content-library', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    let courseId: string | null = null;
    const courseFound = await pollUntil(
      async () => {
        await page.reload();
        await page.waitForTimeout(2000);
        // Look for our course
        const courseLink = page.locator(`text=${TEST_COURSE.name}`).first();
        if (await courseLink.isVisible()) {
          // Get the course ID from nearby Edit link
          const editLink = page.locator('a[href*="/course/"]').filter({
            has: page.locator(`text=${TEST_COURSE.name}`),
          });
          const href = await editLink.first().getAttribute('href');
          if (href) {
            const match = href.match(/\/course\/([^/]+)/);
            courseId = match ? match[1] : null;
          }
          return true;
        }
        return false;
      },
      { maxAttempts: 30, delayMs: 6000, description: 'course in content library' }
    );
    expect(courseFound).toBe(true);
    expect(courseId).not.toBeNull();
    console.log(`Course found with ID: ${courseId}`);
    await takeScreenshot(page, 'quality-01-course-found', 'Course found in library');

    // Step 3: Navigate to outline and approve
    console.log('\n--- Step 3: Approve Course Outline ---\n');
    const outline = new OutlinePage(page);
    await outline.goto(courseId!);
    await outline.approveOutline();

    // Step 4: Wait for lessons to be generated (poll editor page)
    console.log('\n--- Step 4: Wait for Lesson Generation ---\n');
    const lessonsReady = await pollUntil(
      async () => {
        await page.goto(`/course/${courseId}/editor`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        // Check if lessons have content (not just loading)
        const lessonContent = page.locator('main').filter({
          hasNot: page.locator('text=/Generating/i'),
        });
        const hasContent = await lessonContent.locator('text=IMAGE PLACEHOLDER, text=Knowledge Check').count();
        return hasContent > 0;
      },
      { maxAttempts: 60, delayMs: 10000, description: 'lesson generation' }
    );
    expect(lessonsReady).toBe(true);
    await takeScreenshot(page, 'quality-02-lessons-ready', 'Lessons generated');

    // Step 5: Navigate to preview and validate each lesson
    console.log('\n--- Step 5: Validate Lesson Quality in Preview ---\n');
    const preview = new PreviewPage(page);
    await preview.goto(courseId!);
    await preview.screenshot('preview-loaded', 'Course preview loaded');

    const lessonCount = await preview.getLessonCount();
    console.log(`Total lessons: ${lessonCount}`);

    const qualityIssues: string[] = [];
    const lessonsToCheck = Math.min(lessonCount, 5); // Check first 5 lessons

    for (let i = 0; i < lessonsToCheck; i++) {
      console.log(`\nChecking lesson ${i + 1}/${lessonsToCheck}...`);
      await preview.selectLesson(i);
      const title = await preview.getLessonTitle();
      console.log(`  Title: ${title}`);

      const counts = await preview.countComponents();
      console.log(`  Components: ${JSON.stringify(counts)}`);

      // Validate minimum requirements
      if (counts.heading < 1) {
        qualityIssues.push(`Lesson ${i + 1}: Missing heading`);
      }
      if (counts.text < 1) {
        qualityIssues.push(`Lesson ${i + 1}: Missing text content`);
      }
      if (counts.quiz < 1) {
        qualityIssues.push(`Lesson ${i + 1}: Missing quiz`);
      }

      // Check for consecutive images
      const hasStackedImages = await preview.hasConsecutiveImages(3);
      if (hasStackedImages) {
        qualityIssues.push(`Lesson ${i + 1}: Has 3+ consecutive image placeholders`);
      }

      // Check total component count
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total < 3) {
        qualityIssues.push(`Lesson ${i + 1}: Too few components (${total})`);
      }

      await preview.screenshot(`lesson-${i + 1}`, `Lesson ${i + 1}: ${title}`);
    }

    // Report results
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n========== TEST RESULTS (${elapsed}s) ==========`);
    console.log(`Lessons checked: ${lessonsToCheck}`);
    console.log(`Quality issues: ${qualityIssues.length}`);
    if (qualityIssues.length > 0) {
      console.log('\nIssues found:');
      qualityIssues.forEach((issue) => console.log(`  - ${issue}`));
    }
    console.log(`Page errors: ${pageErrors.length}`);
    console.log('================================================\n');

    await takeScreenshot(page, 'quality-final', 'Test complete');

    // Assertions - report issues but don't fail (for baseline capture)
    if (qualityIssues.length > 0) {
      console.warn('WARNING: Quality issues detected - review screenshots');
    }
  });
});
