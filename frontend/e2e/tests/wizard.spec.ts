/**
 * Unified Course Creation Wizard — E2E Tests
 *
 * Tests the Temporal-based wizard flow for an instructional designer creating a course.
 * The wizard runs as a single-page Temporal workflow with polling-based state transitions.
 *
 * Flow: Idle → Title → Outcomes → SME Personas → Audience Personas → Tone → (Plan) → Outline → Lessons → Complete
 *
 * Each approval step shows "Review: <Step Name>" heading.
 * Selection-only steps (personas, tone) hide the Regenerate button.
 * Title and Outcomes steps have editable fields.
 */
import { test, expect } from '@playwright/test';
import { WizardPage } from '../pages';
import { takeScreenshot } from '../helpers';

// ============================================================
// Suite 1: Wizard Page Structure & Idle State
// ============================================================

test.describe('Wizard Page Structure', () => {
  test('should load wizard page with correct stepper labels', async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[CONSOLE_ERROR] ${msg.text()}`);
    });

    const wizard = new WizardPage(page);
    await wizard.goto();

    // Assert all 5 phase labels are visible
    await wizard.assertStepperLabels();

    await takeScreenshot(page, 'wizard-structure-stepper', 'Stepper with correct labels');
  });

  test('should show idle form with course name, outcomes, and Add Knowledge button', async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[CONSOLE_ERROR] ${msg.text()}`);
    });

    const wizard = new WizardPage(page);
    await wizard.goto();

    // Course name input
    const nameInput = page.locator('input#courseName');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveAttribute('placeholder', /introduction to|leadership/i);

    // Outcomes textarea
    const outcomesTextarea = page.locator('textarea#outcomes');
    await expect(outcomesTextarea).toBeVisible();

    // "Add Knowledge" button
    await wizard.assertKnowledgeButtonVisible();

    // "Generate Title" button should be disabled when no name entered
    const generateBtn = page.getByRole('button', { name: /generate title/i });
    await expect(generateBtn).toBeDisabled();

    // Enter a name → button should become enabled
    await nameInput.fill('Test Course');
    await expect(generateBtn).toBeEnabled();

    // Helper text about outcomes
    const helperText = page.getByText(/AI will refine your outcomes/i);
    await expect(helperText).toBeVisible();

    await takeScreenshot(page, 'wizard-structure-idle-form', 'Idle form with all elements');
  });

  test('should not show the old Generate sparkle button on outcomes', async ({ page }) => {
    const wizard = new WizardPage(page);
    await wizard.goto();

    // The old "Generate" button with sparkles should NOT be present
    // Only the "Generate Title" button should exist among Generate-labeled buttons
    const allButtons = await page.getByRole('button').allTextContents();
    const generateButtons = allButtons.filter(t => t.includes('Generate'));
    // Should only have "Generate Title" (possibly with arrow text)
    expect(generateButtons.length).toBeLessThanOrEqual(1);

    await takeScreenshot(page, 'wizard-structure-no-generate-sparkle', 'No Generate sparkle button');
  });
});

// ============================================================
// Suite 2: Full Wizard Flow — "Basics of MySQL"
// ============================================================

test.describe('Full Wizard Flow — Basics of MySQL', () => {
  test('should complete full course creation from idle to editor', async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[CONSOLE_ERROR] ${msg.text()}`);
    });
    page.on('pageerror', (error) => {
      console.log(`[PAGE_ERROR] ${error.message}`);
    });

    console.log('\n========== FULL WIZARD FLOW: Basics of MySQL ==========\n');

    const wizard = new WizardPage(page);
    await wizard.goto();

    // ---- Step 1: Fill idle form ----
    await wizard.enterCourseName('Basics of MySQL');
    await wizard.enterDesiredOutcomes(
      '• Learners will be able to write basic SELECT, INSERT, UPDATE, and DELETE queries\n' +
      '• Learners will understand table relationships and JOIN operations\n' +
      '• Learners will demonstrate proficiency in creating and modifying database schemas'
    );
    await wizard.screenshot('idle-form', 'Idle form filled with MySQL course');
    await wizard.clickGenerateTitle();

    // ---- Step 2: Title approval ----
    await wizard.waitForApprovalStep('Title & Description');
    // Title should be editable
    await wizard.assertTitleEditable();
    const originalTitle = await wizard.getTitleValue();
    console.log(`AI-generated title: "${originalTitle}"`);
    expect(originalTitle.length).toBeGreaterThan(0);

    // Verify Regenerate button IS visible for title step
    const regenBtn = page.getByRole('button', { name: /^regenerate$/i });
    await expect(regenBtn).toBeVisible();

    await wizard.clickApprove();

    // ---- Step 3: Outcomes approval ----
    await wizard.waitForApprovalStep('Learning Outcomes');
    await wizard.assertOutcomesEditable();
    const outcomesText = await wizard.getOutcomesValue();
    console.log(`AI outcomes preview: "${outcomesText.substring(0, 100)}..."`);
    expect(outcomesText.length).toBeGreaterThan(0);

    // Verify Regenerate button IS visible for outcomes step
    await expect(page.getByRole('button', { name: /^regenerate$/i })).toBeVisible();

    await wizard.clickApprove();

    // ---- Step 4: SME Personas ----
    await wizard.waitForApprovalStep('SME Personas');
    await wizard.assertPersonaGrid();

    // Check selection count (all should be pre-selected)
    const smeCount = await wizard.getSelectionCount();
    console.log(`SME selection: ${smeCount}`);
    expect(smeCount).toMatch(/\d+ of \d+ selected/);

    // Regenerate should NOT be visible for persona steps
    await wizard.assertNoRegenerateButton();
    await wizard.assertSelectionInstructionText();

    // Test expand/collapse
    await wizard.expandPersonaCard(0);
    await wizard.screenshot('sme-expanded', 'SME persona expanded');

    await wizard.clickApprove();

    // ---- Step 5: Audience Personas ----
    await wizard.waitForApprovalStep('Target Audience');
    await wizard.assertPersonaGrid();

    // Regenerate should NOT be visible
    await wizard.assertNoRegenerateButton();

    const audienceCount = await wizard.getSelectionCount();
    console.log(`Audience selection: ${audienceCount}`);

    await wizard.clickApprove();

    // ---- Step 6: Tone Selection ----
    await wizard.waitForApprovalStep('Tone & Style');
    await wizard.assertToneOptions();
    await wizard.assertAdditionalContextField();

    // Regenerate should NOT be visible for tone step
    await wizard.assertNoRegenerateButton();

    await wizard.clickApprove();

    // ---- Step 7: Outline ----
    await wizard.waitForApprovalStep('Course Outline', 180000);

    // Outline step SHOULD have Regenerate button
    await expect(page.getByRole('button', { name: /^regenerate$/i })).toBeVisible();

    await wizard.screenshot('outline-review', 'Outline review');
    await wizard.clickApprove();

    // ---- Step 8: Wait for completion ----
    await wizard.waitForCompletion();
    await wizard.assertOpenInEditorButton();

    // Navigate to editor
    const editorUrl = await wizard.clickOpenInEditor();
    expect(editorUrl).toContain('/editor');

    await takeScreenshot(page, 'wizard-flow-complete', 'Full wizard flow complete — in editor');

    console.log('\n========== WIZARD FLOW COMPLETE ==========\n');
  });
});

// ============================================================
// Suite 3: Editable Title — Modify and Approve
// ============================================================

test.describe('Editable Title Step', () => {
  test('should allow editing the AI-generated title before approving', async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[CONSOLE_ERROR] ${msg.text()}`);
    });

    console.log('\n========== EDITABLE TITLE TEST ==========\n');

    const wizard = new WizardPage(page);
    await wizard.goto();

    await wizard.enterCourseName('How to BBQ for a Party');
    await wizard.clickGenerateTitle();

    // Wait for title approval step
    await wizard.waitForApprovalStep('Title & Description');

    // Verify it's editable
    await wizard.assertTitleEditable();
    const aiTitle = await wizard.getTitleValue();
    console.log(`AI title: "${aiTitle}"`);

    // Edit to a custom title
    const customTitle = 'The Ultimate BBQ Guide: Hosting an Unforgettable Party';
    await wizard.editTitle(customTitle);

    // Verify edit took effect
    const editedTitle = await wizard.getTitleValue();
    expect(editedTitle).toBe(customTitle);

    await wizard.screenshot('title-custom-edit', 'Title edited to custom value');

    // Approve with the edited title
    await wizard.clickApprove();

    // Wait for next step to confirm workflow continued
    await wizard.waitForApprovalStep('Learning Outcomes');
    console.log('Title edit accepted — workflow continued to outcomes');

    await takeScreenshot(page, 'wizard-title-edit-success', 'Title edit accepted, now at outcomes');

    console.log('\n========== EDITABLE TITLE TEST COMPLETE ==========\n');
  });
});

// ============================================================
// Suite 4: Persona Selection — Deselect/Reselect
// ============================================================

test.describe('Persona Selection Controls', () => {
  test('should allow deselecting and reselecting personas', async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[CONSOLE_ERROR] ${msg.text()}`);
    });

    console.log('\n========== PERSONA SELECTION TEST ==========\n');

    const wizard = new WizardPage(page);
    await wizard.goto();

    await wizard.enterCourseName('Introduction to Data Science');
    await wizard.clickGenerateTitle();

    // Approve title
    await wizard.waitForApprovalStep('Title & Description');
    await wizard.clickApprove();

    // Approve outcomes
    await wizard.waitForApprovalStep('Learning Outcomes');
    await wizard.clickApprove();

    // Now at SME Personas
    await wizard.waitForApprovalStep('SME Personas');
    await wizard.assertPersonaGrid();

    // All should be selected initially
    const initialCount = await wizard.getSelectionCount();
    console.log(`Initial SME count: ${initialCount}`);
    expect(initialCount).toMatch(/3 of 3 selected/);

    // Deselect all
    await wizard.clickDeselectAll();
    await wizard.screenshot('sme-deselected', 'All SME personas deselected');

    const deselectedCount = await wizard.getSelectionCount();
    expect(deselectedCount).toMatch(/0 of 3 selected/);

    // Reselect all
    await wizard.clickSelectAll();
    const reselectedCount = await wizard.getSelectionCount();
    expect(reselectedCount).toMatch(/3 of 3 selected/);

    await wizard.screenshot('sme-reselected', 'All SME personas reselected');
    await wizard.clickApprove();

    // Verify workflow continues
    await wizard.waitForApprovalStep('Target Audience');
    console.log('Persona selection worked — moved to audience step');

    await takeScreenshot(page, 'wizard-persona-selection-success', 'Persona selection verified');

    console.log('\n========== PERSONA SELECTION TEST COMPLETE ==========\n');
  });
});

// ============================================================
// Suite 5: Tone Additional Context
// ============================================================

test.describe('Tone Step Additional Context', () => {
  test('should allow adding additional context in tone step', async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[CONSOLE_ERROR] ${msg.text()}`);
    });

    console.log('\n========== TONE CONTEXT TEST ==========\n');

    const wizard = new WizardPage(page);
    await wizard.goto();

    await wizard.enterCourseName('Leadership for New Managers');
    await wizard.clickGenerateTitle();

    // Quick-approve through to tone step
    await wizard.waitForApprovalStep('Title & Description');
    await wizard.clickApprove();
    await wizard.waitForApprovalStep('Learning Outcomes');
    await wizard.clickApprove();
    await wizard.waitForApprovalStep('SME Personas');
    await wizard.clickApprove();
    await wizard.waitForApprovalStep('Target Audience');
    await wizard.clickApprove();

    // Now at Tone step
    await wizard.waitForApprovalStep('Tone & Style');
    await wizard.assertToneOptions();
    await wizard.assertAdditionalContextField();

    // Fill in additional context
    await wizard.fillAdditionalContext(
      'Please emphasize practical scenarios and avoid corporate jargon. ' +
      'The audience prefers a conversational, mentoring-style approach.'
    );

    await wizard.screenshot('tone-with-context', 'Tone step with additional context');

    // Approve
    await wizard.clickApprove();

    // Verify workflow continues to outline
    await wizard.waitForApprovalStep('Course Outline', 180000);
    console.log('Tone with context accepted — moved to outline step');

    await takeScreenshot(page, 'wizard-tone-context-success', 'Tone context accepted');

    console.log('\n========== TONE CONTEXT TEST COMPLETE ==========\n');
  });
});
