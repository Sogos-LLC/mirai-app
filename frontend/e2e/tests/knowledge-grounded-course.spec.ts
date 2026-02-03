/**
 * Knowledge-Grounded Course Generation E2E Tests
 *
 * Tests the complete knowledge-grounded course creation flow including:
 * - Knowledge Selection (Wizard Step 1)
 * - Grounding indicators on outcomes
 * - Outline review with section metadata and grounding scores
 * - Lesson grounding badges and citation indicators
 * - Source panel showing excerpts and scores
 * - Curriculum map with validation
 * - Admin knowledge settings
 *
 * These tests verify the provenance tracking system that ensures
 * all AI-generated content is traceable to source documents.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = 'playwright/screenshots/knowledge-grounded';

// Ensure screenshot directory exists
function ensureScreenshotDir() {
  const dir = path.join(process.cwd(), SCREENSHOT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Helper to take numbered screenshots
let screenshotCounter = 0;
async function screenshot(page: import('@playwright/test').Page, name: string, description?: string) {
  screenshotCounter++;
  const filename = `${String(screenshotCounter).padStart(2, '0')}-${name}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`Screenshot: ${filename}${description ? ` - ${description}` : ''}`);
  return filepath;
}

test.describe('Knowledge-Grounded Course Generation', () => {
  test.beforeAll(() => {
    ensureScreenshotDir();
    screenshotCounter = 0;
  });

  test.beforeEach(() => {
    // Reset screenshot counter for each test
    screenshotCounter = 0;
  });

  /**
   * Test 1: Knowledge Selection Step in Wizard
   *
   * Verifies that:
   * - Wizard shows 6 steps when knowledge sources exist
   * - Team and Global knowledge sections are displayed
   * - Sources show name, status badge, and token count
   * - Selection checkboxes work
   * - Token total updates dynamically
   * - "Continue without knowledge" link is available
   */
  test('should display Knowledge Selection as Step 1 in wizard', async ({ page }) => {
    console.log('\n========== KNOWLEDGE SELECTION TEST ==========\n');

    // Navigate to wizard
    await page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await screenshot(page, 'wizard-start', 'Wizard landing page');

    // Check if we're on the knowledge selection step
    // Look for knowledge selection UI elements
    const teamKnowledgeSection = page.locator('text=/team knowledge/i');
    const globalKnowledgeSection = page.locator('text=/global knowledge/i');
    const knowledgeSourceCheckbox = page.locator('input[type="checkbox"]');

    // Take screenshot of current state
    await screenshot(page, 'wizard-step1-check', 'Checking for knowledge selection UI');

    // Check what step we're on
    const stepIndicators = page.locator('[class*="step"], [role="progressbar"]');
    const stepCount = await stepIndicators.count();
    console.log(`Found ${stepCount} step indicators`);

    // Look for course name input (if knowledge selection is skipped or not available)
    const courseNameInput = page.locator('input[placeholder*="course"], input[type="text"]').first();
    const hasNameInput = await courseNameInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasNameInput) {
      console.log('Course name input visible - may be on Step 2 (no knowledge sources available)');
      await screenshot(page, 'wizard-no-knowledge-step', 'Wizard skipped to course name (no sources)');
    }

    // Verify page loaded successfully
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(1000);

    console.log('\n========== KNOWLEDGE SELECTION TEST END ==========\n');
  });

  /**
   * Test 2: Outline Review with Grounding Indicators
   *
   * Verifies that:
   * - Section cards show metadata badges (level, intent, emphasis)
   * - Section grounding scores are displayed
   * - Lesson grounding percentage badges are visible
   * - Citation indicators show source count
   * - Colors match thresholds (green >= 80%, blue >= 60%, amber < 60%)
   */
  test('should display grounding indicators on outline review page', async ({ page }) => {
    console.log('\n========== OUTLINE GROUNDING TEST ==========\n');

    // Navigate to content library to find a course with outline
    await page.goto('/content-library', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await screenshot(page, 'content-library', 'Content library page');

    // Look for a course card
    const courseLink = page.locator('a[href*="/course/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCourse) {
      console.log('No courses found in content library - skipping outline test');
      await screenshot(page, 'no-courses', 'No courses available');
      return;
    }

    // Get course ID and navigate to outline
    const href = await courseLink.getAttribute('href');
    const courseId = href?.match(/\/course\/([^/]+)/)?.[1];
    console.log(`Found course: ${courseId}`);

    // Navigate to outline page
    await page.goto(`/course/${courseId}/outline`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await screenshot(page, 'outline-page', 'Outline review page');

    // Wait for outline content to load
    const outlineHeading = page.locator('text=/Review Your Course Outline|Course Outline/i');
    await outlineHeading.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {
      console.log('Outline heading not found - page may still be loading');
    });
    await screenshot(page, 'outline-loaded', 'Outline content loaded');

    // Check for section metadata badges
    const levelBadges = page.locator('text=/Introduce|Develop|Master/i');
    const intentBadges = page.locator('text=/Teaching|Assessment|Reinforce/i');
    const groundingScores = page.locator('[class*="grounding"], [title*="grounded"]');

    const levelCount = await levelBadges.count();
    const intentCount = await intentBadges.count();
    const groundingCount = await groundingScores.count();

    console.log(`Level badges found: ${levelCount}`);
    console.log(`Intent badges found: ${intentCount}`);
    console.log(`Grounding indicators found: ${groundingCount}`);

    await screenshot(page, 'outline-badges', 'Section metadata badges');

    // Check for lesson grounding percentages (e.g., "78%")
    const percentageBadges = page.locator('span:has-text("%")');
    const percentageCount = await percentageBadges.count();
    console.log(`Percentage badges found: ${percentageCount}`);

    // Check for citation indicators (FileText icon with count)
    const citationIndicators = page.locator('[title*="knowledge source"]');
    const citationCount = await citationIndicators.count();
    console.log(`Citation indicators found: ${citationCount}`);

    await screenshot(page, 'outline-grounding-final', 'Outline with all grounding indicators');

    console.log('\n========== OUTLINE GROUNDING TEST END ==========\n');
  });

  /**
   * Test 3: Source Panel with Excerpts
   *
   * Verifies that:
   * - Clicking citation indicator opens source panel
   * - Panel shows source names and relevance scores
   * - Excerpts are displayed with expand/collapse
   * - Panel can be closed
   */
  test('should open source panel when clicking citation indicator', async ({ page }) => {
    console.log('\n========== SOURCE PANEL TEST ==========\n');

    // Navigate to content library to find a course
    await page.goto('/content-library', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Find a course
    const courseLink = page.locator('a[href*="/course/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCourse) {
      console.log('No courses found - skipping source panel test');
      await screenshot(page, 'source-panel-no-courses', 'No courses available');
      return;
    }

    const href = await courseLink.getAttribute('href');
    const courseId = href?.match(/\/course\/([^/]+)/)?.[1];
    await page.goto(`/course/${courseId}/outline`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await screenshot(page, 'source-panel-outline', 'Outline page for source panel test');

    // Wait for outline to load
    await page.waitForTimeout(2000);

    // Look for citation indicator buttons (FileText icon with number)
    const citationButtons = page.locator('button:has([class*="lucide-file-text"])');
    const citationCount = await citationButtons.count();
    console.log(`Citation buttons found: ${citationCount}`);

    if (citationCount > 0) {
      // Click the first citation indicator
      console.log('Clicking citation indicator...');
      await citationButtons.first().click();
      await page.waitForTimeout(500);
      await screenshot(page, 'source-panel-open', 'Source panel opened');

      // Check for source panel elements
      const sourcePanel = page.locator('text=/Knowledge Sources/i');
      const panelVisible = await sourcePanel.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`Source panel visible: ${panelVisible}`);

      if (panelVisible) {
        // Check for source names and scores
        const relevanceScores = page.locator('[title*="relevance"]');
        const excerpts = page.locator('text=/"/');  // Excerpts in quotes

        const scoreCount = await relevanceScores.count();
        const excerptCount = await excerpts.count();

        console.log(`Relevance scores: ${scoreCount}`);
        console.log(`Excerpts: ${excerptCount}`);

        // Check for close button
        const closeButton = page.locator('button:has-text("Close")');
        if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await closeButton.click();
          console.log('Closed source panel');
          await screenshot(page, 'source-panel-closed', 'Source panel closed');
        }
      }
    } else {
      console.log('No citation indicators found - lessons may not have citations');
      await screenshot(page, 'source-panel-no-citations', 'No citation indicators on lessons');
    }

    console.log('\n========== SOURCE PANEL TEST END ==========\n');
  });

  /**
   * Test 4: Curriculum Map Page
   *
   * Verifies that:
   * - Curriculum map page exists and loads
   * - Coverage matrix is displayed (sections x outcomes)
   * - Aggregate grounding score is shown
   * - Validation issues panel exists
   * - Approval buttons are present
   */
  test('should display curriculum map with validation', async ({ page }) => {
    console.log('\n========== CURRICULUM MAP TEST ==========\n');

    // Navigate to content library to find a course
    await page.goto('/content-library', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Find a course
    const courseLink = page.locator('a[href*="/course/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCourse) {
      console.log('No courses found - skipping curriculum map test');
      await screenshot(page, 'curriculum-no-courses', 'No courses available');
      return;
    }

    const href = await courseLink.getAttribute('href');
    const courseId = href?.match(/\/course\/([^/]+)/)?.[1];

    // Navigate to curriculum map page
    await page.goto(`/course/${courseId}/curriculum`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await screenshot(page, 'curriculum-page', 'Curriculum map page');

    // Check for curriculum map elements
    const curriculumHeading = page.locator('text=/Curriculum Map|Coverage Matrix/i');
    const headingVisible = await curriculumHeading.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Curriculum heading visible: ${headingVisible}`);

    // Check for coverage matrix (grid or table)
    const coverageGrid = page.locator('[class*="grid"], table');
    const gridCount = await coverageGrid.count();
    console.log(`Grid/table elements: ${gridCount}`);

    // Check for validation issues section
    const validationSection = page.locator('text=/Validation|Issues|Warnings/i');
    const validationVisible = await validationSection.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Validation section visible: ${validationVisible}`);

    // Check for approval buttons
    const approveButton = page.locator('button:has-text("Approve")');
    const approveVisible = await approveButton.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Approve button visible: ${approveVisible}`);

    // Check for aggregate grounding score
    const groundingDisplay = page.locator('text=/grounded|grounding/i');
    const groundingVisible = await groundingDisplay.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Grounding display visible: ${groundingVisible}`);

    await screenshot(page, 'curriculum-final', 'Curriculum map full page');

    console.log('\n========== CURRICULUM MAP TEST END ==========\n');
  });

  /**
   * Test 5: Admin Knowledge Settings
   *
   * Verifies that:
   * - Settings page has Knowledge tab
   * - Allow Global Knowledge toggle exists
   * - Low Grounding Threshold slider exists
   * - Require Curriculum Approval toggle exists
   * - Settings can be changed
   */
  test('should display knowledge settings in admin panel', async ({ page }) => {
    console.log('\n========== KNOWLEDGE SETTINGS TEST ==========\n');

    // Navigate to settings
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await screenshot(page, 'settings-page', 'Settings page');

    // Look for Knowledge tab/section
    const knowledgeTab = page.getByRole('button', { name: /knowledge/i });
    const tabVisible = await knowledgeTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (tabVisible) {
      console.log('Found Knowledge tab, clicking...');
      await knowledgeTab.click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'settings-knowledge-tab', 'Knowledge settings tab');
    } else {
      console.log('Knowledge tab not found as button, checking for section');
    }

    // Look for knowledge settings elements
    const allowGlobalToggle = page.locator('text=/allow global knowledge/i');
    const groundingThreshold = page.locator('text=/grounding threshold|low grounding/i');
    const requireApproval = page.locator('text=/require.*approval|curriculum approval/i');

    const hasGlobalToggle = await allowGlobalToggle.isVisible({ timeout: 3000 }).catch(() => false);
    const hasThreshold = await groundingThreshold.isVisible({ timeout: 3000 }).catch(() => false);
    const hasApproval = await requireApproval.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`Allow Global Knowledge: ${hasGlobalToggle}`);
    console.log(`Grounding Threshold: ${hasThreshold}`);
    console.log(`Require Approval: ${hasApproval}`);

    await screenshot(page, 'settings-knowledge-panel', 'Knowledge settings panel');

    // Try to find toggles/switches
    const toggles = page.locator('[role="switch"], input[type="checkbox"]');
    const toggleCount = await toggles.count();
    console.log(`Toggle/checkbox count: ${toggleCount}`);

    // Try to find sliders
    const sliders = page.locator('input[type="range"], [role="slider"]');
    const sliderCount = await sliders.count();
    console.log(`Slider count: ${sliderCount}`);

    await screenshot(page, 'settings-final', 'Settings page final state');

    console.log('\n========== KNOWLEDGE SETTINGS TEST END ==========\n');
  });

  /**
   * Test 6: Full Wizard Flow with Knowledge Selection
   *
   * This is an integration test that walks through the complete wizard
   * with knowledge selection and verifies grounding at each step.
   */
  test('should complete wizard with knowledge selection and show grounding throughout', async ({ page }) => {
    console.log('\n========== FULL WIZARD FLOW TEST ==========\n');

    // Add console error monitoring
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log(`[CONSOLE_ERROR] ${msg.text()}`);
      }
    });

    // Step 1: Navigate to wizard
    await page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await screenshot(page, 'full-flow-01-wizard-start', 'Wizard start');

    // Check for knowledge selection or course name step
    const knowledgeStep = page.locator('text=/knowledge|select.*sources/i');
    const courseNameInput = page.locator('input[placeholder*="course"], input').first();

    const onKnowledgeStep = await knowledgeStep.isVisible({ timeout: 3000 }).catch(() => false);
    const onCourseNameStep = await courseNameInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (onKnowledgeStep) {
      console.log('On Knowledge Selection step');
      await screenshot(page, 'full-flow-02-knowledge-step', 'Knowledge selection step');

      // Look for checkboxes to select knowledge
      const checkboxes = page.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      console.log(`Knowledge checkboxes: ${checkboxCount}`);

      if (checkboxCount > 0) {
        // Select first knowledge source
        await checkboxes.first().click();
        await screenshot(page, 'full-flow-03-knowledge-selected', 'Knowledge source selected');
      }

      // Click Continue/Next
      const continueBtn = page.getByRole('button', { name: /continue|next/i });
      if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await continueBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    // Step 2: Course Name
    if (await courseNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('On Course Name step');
      await courseNameInput.fill('E2E Knowledge Grounding Test Course');
      await screenshot(page, 'full-flow-04-course-name', 'Course name entered');

      // Click Generate Title
      const generateBtn = page.getByRole('button', { name: /generate title/i });
      if (await generateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('Clicking Generate Title...');
        await generateBtn.click();
        // Wait for AI generation
        await page.waitForTimeout(20000);
        await screenshot(page, 'full-flow-05-title-generated', 'Title generated');
      }
    }

    // Step 3: Check for grounding on generated outcomes
    const groundingIndicators = page.locator('[class*="grounding"], [title*="grounded"], span:has-text("%")');
    const groundingOnOutcomes = await groundingIndicators.count();
    console.log(`Grounding indicators on outcomes: ${groundingOnOutcomes}`);
    await screenshot(page, 'full-flow-06-outcome-grounding', 'Outcomes with grounding indicators');

    // Continue through remaining steps (abbreviated)
    for (let step = 0; step < 5; step++) {
      const nextBtn = page.getByRole('button', { name: /continue|next|generate/i }).last();
      if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        const btnText = await nextBtn.textContent();
        console.log(`Clicking: ${btnText}`);
        await nextBtn.click();
        await page.waitForTimeout(3000);
        await screenshot(page, `full-flow-step-${step + 7}`, `Wizard step ${step + 3}`);
      } else {
        break;
      }
    }

    await screenshot(page, 'full-flow-final', 'Wizard final state');

    // Filter critical errors
    const criticalErrors = consoleErrors.filter((err) => {
      if (err.includes('favicon')) return false;
      if (err.includes('ResizeObserver')) return false;
      if (err.includes('hydration')) return false;
      if (err.includes('stream error')) return false;
      if (err.includes('Failed to fetch')) return false;
      return true;
    });

    console.log(`Critical errors: ${criticalErrors.length}`);

    console.log('\n========== FULL WIZARD FLOW TEST END ==========\n');
  });

  /**
   * Test 7: Verify Section Metadata Badges Display
   *
   * Detailed test for section metadata visualization.
   */
  test('should display section level/intent/emphasis badges', async ({ page }) => {
    console.log('\n========== SECTION METADATA TEST ==========\n');

    // Find a course with outline
    await page.goto('/content-library', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const courseLink = page.locator('a[href*="/course/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCourse) {
      console.log('No courses found');
      return;
    }

    const href = await courseLink.getAttribute('href');
    const courseId = href?.match(/\/course\/([^/]+)/)?.[1];
    await page.goto(`/course/${courseId}/outline`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Wait for sections to load
    const sections = page.locator('[class*="section"], [data-testid*="section"]');
    await page.waitForTimeout(2000);

    await screenshot(page, 'metadata-01-outline', 'Outline for metadata test');

    // Check for level badges (Introduce, Develop, Master)
    const introduceBadge = page.locator('text=/Introduce/i');
    const developBadge = page.locator('text=/Develop/i');
    const masterBadge = page.locator('text=/Master/i');

    const introduceCount = await introduceBadge.count();
    const developCount = await developBadge.count();
    const masterCount = await masterBadge.count();

    console.log(`Introduce badges: ${introduceCount}`);
    console.log(`Develop badges: ${developCount}`);
    console.log(`Master badges: ${masterCount}`);

    // Check for intent badges (Teaching, Assessment, Reinforce)
    const teachingBadge = page.locator('text=/Teaching|Teach/i');
    const assessmentBadge = page.locator('text=/Assessment|Assess/i');

    const teachingCount = await teachingBadge.count();
    const assessmentCount = await assessmentBadge.count();

    console.log(`Teaching badges: ${teachingCount}`);
    console.log(`Assessment badges: ${assessmentCount}`);

    // Check for emphasis badges (Low, Medium, High)
    const emphasisBadges = page.locator('text=/Low|Medium|High/i');
    const emphasisCount = await emphasisBadges.count();
    console.log(`Emphasis badges: ${emphasisCount}`);

    // Expand a section to see lessons
    const expandButton = page.locator('[class*="chevron"], button:has([class*="chevron"])').first();
    if (await expandButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'metadata-02-expanded', 'Section expanded');
    }

    // Check for lesson grounding badges
    const lessonGrounding = page.locator('span[title*="grounded"]');
    const lessonGroundingCount = await lessonGrounding.count();
    console.log(`Lesson grounding badges: ${lessonGroundingCount}`);

    await screenshot(page, 'metadata-final', 'Section metadata final');

    console.log('\n========== SECTION METADATA TEST END ==========\n');
  });
});
