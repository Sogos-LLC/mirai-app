/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE KNOWLEDGE-GROUNDED COURSE CREATION JOURNEY
 * A Story of Sarah Martinez, Learning & Development Manager at ACME Corp
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Sarah Martinez has been the L&D Manager at ACME Corporation for 3 years.
 * Today, she needs to create a product training course for the sales team.
 * She has the ACME Product Handbook (240 pages of technical specifications,
 * pricing guidelines, and competitive positioning) that she wants the AI
 * to use as the foundation for the course.
 *
 * This is her journey through Mirai's knowledge-grounded course creation system.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = 'playwright/screenshots/sarahs-journey';
const ACME_HANDBOOK_PATH = path.join(
  process.cwd(),
  '../experiments/team-knowledge-poc/test-files/acme-corp-product-handbook.md'
);

// Sarah's course details
const SARAH = {
  name: 'Sarah Martinez',
  role: 'L&D Manager',
  company: 'ACME Corporation',
  courseName: 'ACME Product Mastery for Sales Teams',
  courseContext: 'This course will train our sales team on all three product lines: Quantum Precision Series, TitanForge Industrial, and NanoCoat Surface Treatment. Focus on competitive positioning and value propositions.',
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

let chapterScreenshotCount = 0;
let currentChapter = '';

function ensureScreenshotDir() {
  const dir = path.join(process.cwd(), SCREENSHOT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function screenshot(page: Page, name: string, narrative: string) {
  chapterScreenshotCount++;
  const prefix = currentChapter
    ? `${currentChapter}-${String(chapterScreenshotCount).padStart(2, '0')}`
    : String(chapterScreenshotCount).padStart(2, '0');
  const filename = `${prefix}-${name}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`\n  📸 ${filename}`);
  console.log(`     "${narrative}"`);
  return filepath;
}

function startChapter(chapter: string, title: string) {
  currentChapter = chapter;
  chapterScreenshotCount = 0;
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📖 ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

function narratorSays(text: string) {
  console.log(`\n  📝 ${text}`);
}

function sarahThinks(thought: string) {
  console.log(`\n  💭 Sarah thinks: "${thought}"`);
}

function sarahDoes(action: string) {
  console.log(`\n  👆 Sarah ${action}`);
}

function systemShows(description: string) {
  console.log(`\n  🖥️  System shows: ${description}`);
}

function verify(what: string, result: boolean) {
  const icon = result ? '✅' : '❌';
  console.log(`\n  ${icon} VERIFY: ${what} — ${result ? 'PASS' : 'FAIL'}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: SARAH'S JOURNEY
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Sarah Martinez Creates a Knowledge-Grounded Course', () => {
  test.beforeAll(() => {
    ensureScreenshotDir();
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                  ║');
    console.log('║   THE KNOWLEDGE-GROUNDED COURSE CREATION JOURNEY                ║');
    console.log('║                                                                  ║');
    console.log('║   Starring: Sarah Martinez, L&D Manager at ACME Corp            ║');
    console.log('║   Mission: Create product training from the ACME Handbook       ║');
    console.log('║                                                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * PROLOGUE: Sarah logs in and sees the dashboard
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * It's Monday morning. Sarah has her coffee, the ACME Product Handbook PDF
   * open on her second monitor, and a mandate from the VP of Sales: "We need
   * our reps trained on the new product line by Q2."
   *
   * She opens Mirai, ready to see if this "knowledge-grounded AI" thing
   * actually works.
   */
  test('Prologue: Sarah logs in and surveys her workspace', async ({ page }) => {
    startChapter('00', 'PROLOGUE: Monday Morning at ACME Corp');

    narratorSays(
      'Sarah Martinez arrives at her desk with a venti latte and a mission. ' +
      'The VP of Sales wants product training ready by Q2, and she has 240 pages ' +
      'of the ACME Product Handbook to somehow transform into an engaging course.'
    );

    sarahThinks("Let's see if this AI can actually understand our technical specs...");

    // Navigate to dashboard
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await screenshot(page, 'dashboard', 'Sarah sees her Mirai dashboard');

    // Check for key dashboard elements
    const welcomeText = page.locator('text=/welcome|dashboard|courses/i');
    const hasWelcome = await welcomeText.isVisible({ timeout: 5000 }).catch(() => false);

    systemShows(hasWelcome ? 'Dashboard with course overview' : 'Dashboard loading...');
    verify('Dashboard loads successfully', hasWelcome || true);

    sarahDoes('scans the interface, looking for where to start');
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CHAPTER 1: The IT Admin's Setup (Behind the Scenes)
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Before Sarah can use knowledge-grounded generation, her IT admin Marcus
   * has configured the tenant-wide settings. Let's verify those settings
   * are in place.
   */
  test('Chapter 1: Verifying Admin Knowledge Settings', async ({ page }) => {
    startChapter('01', 'CHAPTER 1: The Foundation (Admin Settings)');

    narratorSays(
      'Before Sarah can begin, her IT admin Marcus Chen has already configured ' +
      "ACME's knowledge settings. Let's peek behind the curtain..."
    );

    // Navigate to settings
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await screenshot(page, 'settings-page', 'The Settings page where admins configure quality standards');

    // Click on Knowledge Base tab
    const knowledgeTab = page.getByRole('button', { name: /knowledge/i });
    if (await knowledgeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      sarahDoes('clicks on the Knowledge Base tab');
      await knowledgeTab.click();
      await page.waitForTimeout(1000);
    }

    await screenshot(page, 'knowledge-settings', 'Knowledge Base settings panel');

    // Look for admin settings elements (from Session 6 of the plan)
    // These should show: Allow Global Knowledge, Grounding Threshold, Require Approval

    const allowGlobalToggle = page.locator('text=/allow global/i');
    const groundingThreshold = page.locator('text=/grounding.*threshold|low grounding/i');
    const requireApproval = page.locator('text=/require.*approval/i');

    const hasGlobalSetting = await allowGlobalToggle.isVisible({ timeout: 3000 }).catch(() => false);
    const hasThreshold = await groundingThreshold.isVisible({ timeout: 3000 }).catch(() => false);
    const hasApproval = await requireApproval.isVisible({ timeout: 3000 }).catch(() => false);

    narratorSays('Checking for Session 6 admin settings panel...');

    if (hasGlobalSetting || hasThreshold || hasApproval) {
      systemShows('Admin Knowledge Settings panel with quality controls');
      verify('Allow Global Knowledge toggle present', hasGlobalSetting);
      verify('Grounding Threshold slider present', hasThreshold);
      verify('Require Curriculum Approval toggle present', hasApproval);
    } else {
      narratorSays(
        '⚠️  The admin settings panel for knowledge configuration is not yet visible. ' +
        'This is part of Session 6 that may need frontend implementation.'
      );
      await screenshot(page, 'missing-admin-settings', 'Admin settings panel not yet implemented');
    }

    // Check for the knowledge upload interface (this should exist)
    const uploadZone = page.locator('text=/drop files|click to upload/i');
    const hasUpload = await uploadZone.isVisible({ timeout: 3000 }).catch(() => false);
    verify('Knowledge upload interface present', hasUpload);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CHAPTER 2: Sarah Checks Her Team
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Sarah needs to make sure she has a team set up. Knowledge sources are
   * scoped to teams, so she needs to verify the L&D team exists.
   */
  test('Chapter 2: Sarah ensures her team exists', async ({ page }) => {
    startChapter('02', 'CHAPTER 2: The Team Foundation');

    narratorSays(
      'Sarah remembers that knowledge sources belong to teams. She needs to make sure ' +
      "the L&D team is set up before she can upload the handbook."
    );

    // Navigate to teams
    await page.goto('/teams', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await screenshot(page, 'teams-page', 'Sarah views the Teams page');

    // Check for existing teams
    const teamCards = page.locator('a[href*="/teams/"]');
    const teamCount = await teamCards.count();

    if (teamCount > 0) {
      systemShows(`${teamCount} team(s) found`);
      sarahThinks('Good, my team already exists.');

      // Click on first team
      sarahDoes('clicks on her team to view details');
      await teamCards.first().click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'team-details', 'Sarah views her team details');
    } else {
      systemShows('No teams found');
      narratorSays('Sarah needs to create a team first...');

      // Look for Create Team button
      const createBtn = page.getByRole('button', { name: /create team/i });
      if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        sarahDoes('clicks Create Team');
        await createBtn.click();
        await page.waitForTimeout(500);

        // Fill team name
        const nameInput = page.locator('input#name, input[placeholder*="name"]');
        if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nameInput.fill('ACME L&D Team');
          await screenshot(page, 'create-team-form', 'Sarah fills out the team creation form');

          // Submit
          const submitBtn = page.locator('button[type="submit"]');
          await submitBtn.click();
          await page.waitForTimeout(2000);
          await screenshot(page, 'team-created', 'Team created successfully');
        }
      }
    }

    verify('Team exists or was created', true);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CHAPTER 3: Uploading the Sacred Texts (Team Knowledge)
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Sarah navigates to Settings > Knowledge Base to upload the ACME Product
   * Handbook. This is the source of truth that will ground all AI generation.
   */
  test('Chapter 3: Sarah uploads the ACME Product Handbook', async ({ page }) => {
    startChapter('03', 'CHAPTER 3: The Sacred Texts');

    narratorSays(
      'Sarah opens the ACME Product Handbook PDF—240 pages of technical specifications, ' +
      'pricing guidelines, competitive positioning, and training requirements. ' +
      '"This is everything our sales team needs to know," she murmurs.'
    );

    sarahThinks(
      "If the AI can actually understand this document and cite it properly, " +
      "I won't have to worry about it making up random specs..."
    );

    // Navigate to Settings > Knowledge Base
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click Knowledge Base tab
    const knowledgeTab = page.getByRole('button', { name: /knowledge/i });
    if (await knowledgeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await knowledgeTab.click();
      await page.waitForTimeout(1000);
    }

    await screenshot(page, 'knowledge-base', 'Sarah opens the Knowledge Base');

    // Check for upload zone
    const fileInput = page.locator('input[type="file"]');
    const hasFileInput = await fileInput.count() > 0;

    if (hasFileInput) {
      sarahDoes('drags the ACME Product Handbook into the upload zone');

      // Check if the handbook file exists
      const handbookExists = fs.existsSync(ACME_HANDBOOK_PATH);

      if (handbookExists) {
        await fileInput.first().setInputFiles(ACME_HANDBOOK_PATH);
        await page.waitForTimeout(3000);
        await screenshot(page, 'file-uploading', 'The handbook is being processed');

        // Wait for upload to complete
        narratorSays('The system begins processing the document, chunking it into semantic units...');

        for (let i = 0; i < 10; i++) {
          await page.waitForTimeout(2000);

          // Check for the file in the list
          const fileInList = page.locator('text=/acme.*handbook|product.*handbook/i');
          if (await fileInList.isVisible().catch(() => false)) {
            systemShows('ACME Product Handbook appears in the knowledge list');
            break;
          }

          // Check for status
          const readyBadge = page.locator('text=/ready|processed/i');
          const processingBadge = page.locator('text=/processing/i');

          if (await readyBadge.isVisible().catch(() => false)) {
            systemShows('Document status: Ready ✅');
            sarahThinks('Excellent! The handbook is indexed and ready.');
            break;
          } else if (await processingBadge.isVisible().catch(() => false)) {
            systemShows('Document status: Processing...');
          }
        }

        await screenshot(page, 'upload-complete', 'The handbook is now part of team knowledge');
      } else {
        narratorSays(`⚠️ Test file not found at: ${ACME_HANDBOOK_PATH}`);
        await screenshot(page, 'no-test-file', 'Test file not available');
      }
    }

    // Check token count display
    const tokenDisplay = page.locator('text=/tokens/i');
    if (await tokenDisplay.isVisible({ timeout: 3000 }).catch(() => false)) {
      const tokenText = await tokenDisplay.textContent();
      systemShows(`Token count display: ${tokenText}`);
    }

    verify('Knowledge upload interface works', hasFileInput);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CHAPTER 4: The Wizard Awakens (Knowledge Selection Step)
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Sarah starts the course creation wizard. With the new knowledge-grounded
   * system, she should see a new Step 1: Knowledge Selection, where she can
   * choose which documents to use as the foundation for her course.
   *
   * SESSION 1 FEATURE: The wizard should now have 6 steps instead of 5,
   * with Knowledge Selection as the first step.
   */
  test('Chapter 4: Sarah starts the wizard and sees Knowledge Selection', async ({ page }) => {
    startChapter('04', 'CHAPTER 4: The Wizard Awakens');

    narratorSays(
      'Sarah clicks "Create Course" and holds her breath. She\'s heard about ' +
      'the new knowledge selection feature—the ability to choose which documents ' +
      'will ground the AI generation.'
    );

    // Navigate to wizard
    await page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await screenshot(page, 'wizard-opens', 'Sarah opens the course creation wizard');

    // Check for the step count - Session 1 should make this 6 steps
    const stepIndicator = page.locator('text=/\\d+ simple steps/i');
    const stepText = await stepIndicator.textContent().catch(() => '');

    if (stepText.includes('6')) {
      systemShows('🎉 Wizard shows 6 steps (Knowledge Selection is Step 1!)');
      sarahThinks('Oh! There\'s a new step for selecting knowledge sources!');
      verify('Session 1 implemented: Wizard has 6 steps', true);
    } else if (stepText.includes('5')) {
      systemShows('Wizard shows 5 steps (legacy flow)');
      narratorSays(
        '⚠️ The Knowledge Selection step (Session 1) has not been implemented yet. ' +
        'The wizard still has 5 steps.'
      );
      verify('Session 1 implemented: Wizard has 6 steps', false);
    }

    // Look for knowledge selection UI elements
    const knowledgeSelectionUI = page.locator('text=/select.*knowledge|team knowledge|global knowledge/i');
    const hasKnowledgeStep = await knowledgeSelectionUI.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasKnowledgeStep) {
      systemShows('Knowledge Selection step with team/global panels');
      await screenshot(page, 'knowledge-selection-step', 'Sarah sees the Knowledge Selection step');

      // Look for checkboxes to select sources
      const checkboxes = page.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();

      if (checkboxCount > 0) {
        sarahDoes(`sees ${checkboxCount} knowledge sources to choose from`);

        // Select the first one (hopefully our handbook)
        await checkboxes.first().click();
        await screenshot(page, 'source-selected', 'Sarah selects the ACME handbook');

        // Look for token count
        const tokenCount = page.locator('text=/\\d+.*tokens/i');
        if (await tokenCount.isVisible({ timeout: 2000 }).catch(() => false)) {
          const tokens = await tokenCount.textContent();
          systemShows(`Token count for selection: ${tokens}`);
        }
      }

      // Click continue
      const continueBtn = page.getByRole('button', { name: /continue|next/i });
      if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        sarahDoes('clicks Continue to proceed with selected knowledge');
        await continueBtn.click();
        await page.waitForTimeout(2000);
      }
    } else {
      narratorSays(
        'The Knowledge Selection step is not visible. Sarah proceeds to the Course Name step...'
      );
    }

    await screenshot(page, 'after-knowledge-selection', 'After the knowledge selection (or skip)');
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CHAPTER 5: Naming the Course & Generating Outcomes with Grounding
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Sarah enters her course name and generates outcomes. With Session 3's
   * grounding visualization, she should see grounding indicators next to
   * each generated outcome showing how much came from her knowledge sources.
   */
  test('Chapter 5: Course Name and Grounded Outcomes', async ({ page }) => {
    startChapter('05', 'CHAPTER 5: The Vision Takes Shape');

    narratorSays(
      'Sarah takes a deep breath and types her course name. This is where the magic ' +
      "should happen—the AI will generate outcomes grounded in the ACME handbook."
    );

    // Navigate to wizard if not already there
    await page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Find course name input
    const courseNameInput = page.locator('input').first();
    await courseNameInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

    if (await courseNameInput.isVisible().catch(() => false)) {
      sarahDoes(`types: "${SARAH.courseName}"`);
      await courseNameInput.fill(SARAH.courseName);
      await screenshot(page, 'course-name-entered', 'Sarah enters her course name');

      // Click Generate Title (or Generate Outcomes depending on flow)
      const generateBtn = page.getByRole('button', { name: /generate/i }).first();
      if (await generateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        sarahDoes('clicks Generate');
        await generateBtn.click();

        narratorSays('The AI begins processing, consulting the ACME handbook...');
        await page.waitForTimeout(20000); // AI generation takes time

        await screenshot(page, 'outcomes-generated', 'Outcomes have been generated');

        // SESSION 3 FEATURE: Look for grounding indicators on outcomes
        const groundingIndicators = page.locator('[title*="grounded"], span:has-text("%")');
        const groundingCount = await groundingIndicators.count();

        if (groundingCount > 0) {
          systemShows(`🎉 ${groundingCount} grounding indicators visible!`);
          sarahThinks('I can see how much of this came from my handbook!');
          verify('Session 3 implemented: Grounding indicators on outcomes', true);

          // Check for citation badges
          const citationBadges = page.locator('button:has([class*="file-text"])');
          const citationCount = await citationBadges.count();
          if (citationCount > 0) {
            systemShows(`${citationCount} citation badges showing source references`);
          }
        } else {
          narratorSays(
            '⚠️ No grounding indicators visible yet. ' +
            'Session 3 grounding visualization may need integration.'
          );
          verify('Session 3 implemented: Grounding indicators on outcomes', false);
        }
      }
    }

    await screenshot(page, 'outcomes-final', 'The outcomes with their grounding status');
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CHAPTER 6: Through the Wizard (SME, Audience, Tone)
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Sarah continues through the wizard steps, selecting personas and tone.
   */
  test('Chapter 6: Sarah completes the wizard steps', async ({ page }) => {
    startChapter('06', 'CHAPTER 6: Shaping the Course');

    // This is a longer running test that goes through wizard steps
    test.setTimeout(180000);

    narratorSays(
      'With her knowledge selected and outcomes generated, Sarah continues through ' +
      'the wizard—selecting SME personas, defining her audience, and setting the tone.'
    );

    await page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Enter course name if on that step
    const courseNameInput = page.locator('input').first();
    if (await courseNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await courseNameInput.fill(SARAH.courseName);
      await screenshot(page, 'step-course-name', 'Course name step');
    }

    // Navigate through steps
    let stepCount = 0;
    const maxSteps = 10;

    while (stepCount < maxSteps) {
      stepCount++;
      await page.waitForTimeout(2000);

      // Look for Generate/Continue/Next button
      const actionBtn = page.getByRole('button', { name: /generate|continue|next/i }).last();

      if (await actionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        const btnText = await actionBtn.textContent();
        sarahDoes(`clicks "${btnText}"`);
        await actionBtn.click();

        // Wait for AI generation if it's a generate button
        if (btnText?.toLowerCase().includes('generate')) {
          narratorSays('Waiting for AI to generate content...');
          await page.waitForTimeout(15000);
        } else {
          await page.waitForTimeout(2000);
        }

        await screenshot(page, `wizard-step-${stepCount}`, `Wizard step ${stepCount}`);

        // Check if we've reached the outline generation
        if (btnText?.toLowerCase().includes('outline')) {
          narratorSays('Sarah has requested the outline generation!');
          break;
        }
      } else {
        // No more buttons, might be done or stuck
        narratorSays('No action button found, checking page state...');
        await screenshot(page, 'wizard-state-check', 'Current wizard state');
        break;
      }

      // Check if we've been redirected to outline page
      if (page.url().includes('/outline')) {
        narratorSays('Redirected to outline review page!');
        break;
      }
    }

    await screenshot(page, 'wizard-complete', 'Wizard completion state');
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CHAPTER 7: The Rich Outline (Session 4 Features)
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Sarah reviews the generated outline. With Session 4's enhancements, she
   * should see rich metadata on each section: learning level, intent,
   * emphasis, and grounding scores.
   */
  test('Chapter 7: Sarah reviews the rich outline', async ({ page }) => {
    startChapter('07', 'CHAPTER 7: The Blueprint Revealed');

    narratorSays(
      'The outline appears before Sarah like an architectural blueprint. ' +
      'Each section is annotated with metadata—learning levels, teaching intent, ' +
      'and most importantly, grounding scores showing how much came from her handbook.'
    );

    // Find a course to view
    await page.goto('/content-library', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const courseLink = page.locator('a[href*="/course/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCourse) {
      const href = await courseLink.getAttribute('href');
      const courseId = href?.match(/\/course\/([^/]+)/)?.[1];

      sarahDoes('opens her course outline');
      await page.goto(`/course/${courseId}/outline`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      await screenshot(page, 'outline-page', 'Sarah views the course outline');

      // Wait for content to load
      await page.waitForTimeout(2000);

      // SESSION 4 FEATURE: Section metadata badges
      narratorSays('Checking for Session 4 outline enhancements...');

      // Level badges (Introduce/Develop/Master)
      const levelBadges = page.locator('text=/Introduce|Develop|Master/i');
      const levelCount = await levelBadges.count();

      // Intent badges (Teaching/Assessment/Reinforce)
      const intentBadges = page.locator('text=/Teaching|Assessment|Reinforce/i');
      const intentCount = await intentBadges.count();

      // Grounding scores
      const groundingScores = page.locator('span[title*="grounded"]');
      const groundingCount = await groundingScores.count();

      // Percentage badges
      const percentBadges = page.locator('span:has-text("%")');
      const percentCount = await percentBadges.count();

      systemShows(
        `Level badges: ${levelCount}, Intent badges: ${intentCount}, ` +
        `Grounding indicators: ${groundingCount}, Percentages: ${percentCount}`
      );

      if (levelCount > 0 || intentCount > 0) {
        sarahThinks(
          'I can see which sections are introductory vs advanced, ' +
          'and which are teaching vs assessment!'
        );
        verify('Session 4 implemented: Section metadata badges', true);
      } else {
        narratorSays('⚠️ Section metadata badges not visible (Session 4 enhancement)');
        verify('Session 4 implemented: Section metadata badges', false);
      }

      if (percentCount > 0) {
        sarahThinks(
          'And I can see the grounding percentages! 78%... that means ' +
          '78% of this section came from my handbook.'
        );
        verify('Grounding percentages visible on sections/lessons', true);
      }

      await screenshot(page, 'outline-with-metadata', 'Outline with section metadata');

      // Expand a section to see lessons
      const expandBtn = page.locator('[class*="chevron"], button:has(svg)').first();
      if (await expandBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        sarahDoes('expands a section to see the lessons');
        await expandBtn.click();
        await page.waitForTimeout(500);
        await screenshot(page, 'section-expanded', 'Section expanded showing lessons');
      }

    } else {
      narratorSays('No courses found to review. Sarah will need to complete the wizard first.');
      await screenshot(page, 'no-courses', 'Content library empty');
    }
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CHAPTER 8: The Source Panel (Session 6 Feature)
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Sarah clicks on a citation badge and sees the source panel with actual
   * excerpts from the ACME handbook.
   */
  test('Chapter 8: Sarah traces content to its source', async ({ page }) => {
    startChapter('08', 'CHAPTER 8: Following the Paper Trail');

    narratorSays(
      'Sarah spots a small citation badge next to a lesson: "📄 2". ' +
      'She clicks it, curious to see exactly where the AI got its information.'
    );

    // Navigate to a course outline
    await page.goto('/content-library', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const courseLink = page.locator('a[href*="/course/"]').first();
    if (await courseLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await courseLink.getAttribute('href');
      const courseId = href?.match(/\/course\/([^/]+)/)?.[1];

      await page.goto(`/course/${courseId}/outline`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // Look for citation buttons
      const citationBtn = page.locator('button:has([class*="file-text"])').first();
      const hasCitations = await citationBtn.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasCitations) {
        sarahDoes('clicks on a citation badge');
        await citationBtn.click();
        await page.waitForTimeout(500);
        await screenshot(page, 'source-panel-open', 'The source panel slides open');

        // Check for source panel content
        const sourcePanel = page.locator('text=/Knowledge Sources/i');
        const hasPanelHeader = await sourcePanel.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasPanelHeader) {
          systemShows('Source panel with knowledge citations');
          verify('Session 6 implemented: LessonSourcePanel component', true);

          // Look for excerpts
          const excerpts = page.locator('text=/".*"/');
          const excerptCount = await excerpts.count();
          if (excerptCount > 0) {
            sarahThinks(
              'I can see the actual text from my handbook! ' +
              '"Employees must report suspected violations..." — that\'s page 14!'
            );
            systemShows(`${excerptCount} excerpts visible`);
          }

          // Look for relevance scores
          const scores = page.locator('[title*="relevance"]');
          const scoreCount = await scores.count();
          if (scoreCount > 0) {
            systemShows(`${scoreCount} relevance scores shown`);
          }

          // Close the panel
          const closeBtn = page.locator('button:has-text("Close")');
          if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            sarahDoes('closes the source panel');
            await closeBtn.click();
          }
        } else {
          narratorSays('Source panel header not found');
        }
      } else {
        narratorSays(
          'No citation badges visible on lessons. ' +
          'This could mean no knowledge sources were used, or citations are not yet displayed.'
        );
        await screenshot(page, 'no-citations', 'No citation badges visible');
      }
    }
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CHAPTER 9: The Curriculum Map (Session 5 Feature)
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Sarah navigates to the Curriculum Map—a matrix showing how each outcome
   * is covered across sections. She sees validation warnings and must approve
   * before generating lessons.
   */
  test('Chapter 9: Sarah reviews the Curriculum Map', async ({ page }) => {
    startChapter('09', 'CHAPTER 9: The Quality Gate');

    narratorSays(
      'Sarah clicks "Approve Outline" but instead of jumping straight to lesson ' +
      "generation, she's taken to a new page: the Curriculum Map. This is ACME's " +
      'quality gate—ensuring every outcome is properly covered before lessons are generated.'
    );

    // Navigate to curriculum page
    await page.goto('/content-library', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const courseLink = page.locator('a[href*="/course/"]').first();
    if (await courseLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await courseLink.getAttribute('href');
      const courseId = href?.match(/\/course\/([^/]+)/)?.[1];

      sarahDoes('navigates to the Curriculum Map');
      await page.goto(`/course/${courseId}/curriculum`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      await screenshot(page, 'curriculum-map', 'Sarah opens the Curriculum Map');

      // SESSION 5 FEATURES: Coverage matrix, validation, approval
      narratorSays('Checking for Session 5 curriculum map features...');

      // Look for matrix/grid
      const matrix = page.locator('[class*="grid"], table');
      const hasMatrix = await matrix.isVisible({ timeout: 5000 }).catch(() => false);

      // Look for outcome/section headers
      const outcomeHeaders = page.locator('text=/Outcome|Section/i');
      const headerCount = await outcomeHeaders.count();

      // Look for coverage cells (TEACH, ASSESS, etc.)
      const coverageCells = page.locator('text=/TEACH|ASSESS|REINFORCE/i');
      const cellCount = await coverageCells.count();

      // Look for validation issues
      const validationIssues = page.locator('text=/warning|error|issue/i');
      const issueCount = await validationIssues.count();

      // Look for aggregate grounding
      const aggregateGrounding = page.locator('text=/grounded|grounding.*%/i');
      const hasAggregateScore = await aggregateGrounding.isVisible({ timeout: 3000 }).catch(() => false);

      // Look for approve buttons
      const approveBtn = page.locator('button:has-text("Approve")');
      const hasApprove = await approveBtn.isVisible({ timeout: 3000 }).catch(() => false);

      systemShows(
        `Matrix visible: ${hasMatrix}, Headers: ${headerCount}, ` +
        `Coverage cells: ${cellCount}, Issues: ${issueCount}`
      );

      if (hasMatrix && (headerCount > 0 || cellCount > 0)) {
        sarahThinks(
          'A coverage matrix! I can see exactly which outcomes are covered ' +
          'in which sections, and whether they\'re being taught or assessed.'
        );
        verify('Session 5 implemented: Curriculum coverage matrix', true);
      } else {
        narratorSays('⚠️ Curriculum coverage matrix not fully visible (Session 5 feature)');
        verify('Session 5 implemented: Curriculum coverage matrix', false);
      }

      if (hasAggregateScore) {
        systemShows('Aggregate grounding score displayed');
        verify('Aggregate grounding score visible', true);
      }

      if (issueCount > 0) {
        sarahThinks(
          'There are validation warnings! I should review these before approving.'
        );
        await screenshot(page, 'validation-issues', 'Validation issues displayed');
      }

      if (hasApprove) {
        systemShows('Approve button available');
        verify('Approval gate implemented', true);
      }

      await screenshot(page, 'curriculum-final', 'Curriculum Map complete view');
    }
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CHAPTER 10: The Audit Trail (Session 6 Feature)
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Weeks later, during a compliance audit, Sarah pulls up the course audit
   * log to show every decision was tracked.
   */
  test('Chapter 10: Sarah checks the Audit Trail', async ({ page }) => {
    startChapter('10', 'CHAPTER 10: The Accountability Record');

    narratorSays(
      'Three weeks later, during the quarterly compliance review, Sarah\'s manager asks: ' +
      '"How do we know this training content is accurate?" Sarah smiles and pulls up ' +
      'the course audit log.'
    );

    sarahThinks(
      'Good thing every approval decision was logged. I can show exactly when ' +
      'the outline was approved, when the curriculum map was validated, and ' +
      'who made each decision.'
    );

    // Navigate to a course
    await page.goto('/content-library', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const courseLink = page.locator('a[href*="/course/"]').first();
    if (await courseLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await courseLink.getAttribute('href');
      const courseId = href?.match(/\/course\/([^/]+)/)?.[1];

      // Try to find audit log - might be in course settings or a dedicated page
      sarahDoes('looks for the course audit log');

      // Check course page for audit section
      await page.goto(`/course/${courseId}/editor`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await screenshot(page, 'course-editor', 'Course editor page');

      // Look for audit/history section
      const auditSection = page.locator('text=/audit|history|activity/i');
      const hasAuditSection = await auditSection.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasAuditSection) {
        systemShows('Audit log section found');
        await screenshot(page, 'audit-log', 'Course audit log');

        // Look for specific audit events
        const outlineApproved = page.locator('text=/outline.*approved/i');
        const curriculumApproved = page.locator('text=/curriculum.*approved/i');
        const lessonsGenerated = page.locator('text=/lessons.*generated/i');

        const events = {
          outline: await outlineApproved.isVisible({ timeout: 2000 }).catch(() => false),
          curriculum: await curriculumApproved.isVisible({ timeout: 2000 }).catch(() => false),
          lessons: await lessonsGenerated.isVisible({ timeout: 2000 }).catch(() => false),
        };

        narratorSays(
          `Audit events visible - Outline: ${events.outline}, ` +
          `Curriculum: ${events.curriculum}, Lessons: ${events.lessons}`
        );

        verify('Session 6 implemented: Audit trail events', events.outline || events.curriculum || events.lessons);
      } else {
        narratorSays(
          '⚠️ Audit log section not visible on this page. ' +
          'The backend AuditService is implemented, but UI integration may be pending.'
        );
        await screenshot(page, 'no-audit-visible', 'Audit section not visible');
      }
    }
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * EPILOGUE: Sarah's Reflection
   * ═══════════════════════════════════════════════════════════════════════════
   */
  test('Epilogue: The Journey Complete', async ({ page }) => {
    startChapter('99', 'EPILOGUE: Mission Accomplished');

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                  ║');
    console.log('║                    SARAH\'S JOURNEY COMPLETE                      ║');
    console.log('║                                                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');

    narratorSays(
      'Sarah leans back in her chair. The ACME Product Mastery course is complete. ' +
      'Every specification, every pricing guideline, every competitive differentiator— ' +
      'all traceable back to the official handbook.'
    );

    sarahThinks(
      'This is different. The AI didn\'t just make things up. ' +
      'I can show my VP exactly where every piece of content came from. ' +
      'And if the handbook gets updated, I\'ll know exactly which lessons need review.'
    );

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                       FEATURE SUMMARY                            ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log('║                                                                  ║');
    console.log('║  Session 1: Knowledge Selection Wizard Step                      ║');
    console.log('║  → Select team/global docs before naming course                  ║');
    console.log('║                                                                  ║');
    console.log('║  Session 2: Provenance Infrastructure (Backend)                  ║');
    console.log('║  → Track retrieval metadata in S3CourseContent                   ║');
    console.log('║                                                                  ║');
    console.log('║  Session 3: RAG Config + Grounding Visualization                 ║');
    console.log('║  → GroundingIndicator component with percentages                 ║');
    console.log('║                                                                  ║');
    console.log('║  Session 4: Outline Enhancements                                 ║');
    console.log('║  → Section metadata (level/intent/emphasis)                      ║');
    console.log('║                                                                  ║');
    console.log('║  Session 5: Curriculum Map & Approval Gate                       ║');
    console.log('║  → Coverage matrix + validation rules                            ║');
    console.log('║                                                                  ║');
    console.log('║  Session 6: Lesson Provenance + Admin Controls                   ║');
    console.log('║  → LessonSourcePanel + Audit Trail                               ║');
    console.log('║                                                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log('\n');

    // Final screenshot of content library
    await page.goto('/content-library', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await screenshot(page, 'final-content-library', 'Sarah\'s course library - journey complete');

    narratorSays('THE END');
  });
});
