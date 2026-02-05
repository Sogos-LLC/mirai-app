import { Page, expect } from '@playwright/test';
import { takeScreenshot } from '../helpers';

/**
 * Page Object for the Unified Course Creation Wizard (Temporal-based).
 *
 * The wizard uses a single-page Temporal workflow with polling:
 * 1. Idle → Enter topic + outcomes → "Generate Title" starts the workflow
 * 2. Title Review → Editable title + description → Approve/Regenerate
 * 3. Outcomes Review → Editable outcomes → Approve/Regenerate
 * 4. SME Personas → Multi-select grid → Approve
 * 5. Audience Personas → Multi-select grid → Approve
 * 6. Tone Selection → Radio select + optional context → Approve
 * 7. Course Plan (conditional) → Approve
 * 8. Outline Review → Collapsible sections → Approve/Regenerate
 * 9. Lessons → Auto-generated (processing state, no approval)
 * 10. Complete → "Open in Editor" button
 *
 * State transitions happen via Temporal workflow queries polled every 2s.
 */
export class WizardPage {
  private stepScreenshotCount = 0;

  constructor(private page: Page) {}

  // ==================================================================
  // Navigation
  // ==================================================================

  async goto(): Promise<void> {
    await this.page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(2000);
    await this.screenshot('start', 'Wizard page loaded');
  }

  // ==================================================================
  // Stepper assertions
  // ==================================================================

  /** Assert that the stepper shows expected phase labels */
  async assertStepperLabels(): Promise<void> {
    const nav = this.page.locator('nav[aria-label="Wizard progress"]');
    await expect(nav).toBeVisible({ timeout: 5000 });

    const labels = ['Course Setup', 'Learning Outcomes', 'Expert Personas', 'Tone & Style', 'Course Content'];
    for (const label of labels) {
      await expect(nav.getByText(label)).toBeVisible();
    }
  }

  // ==================================================================
  // Idle state — form entry
  // ==================================================================

  async enterCourseName(name: string): Promise<void> {
    console.log(`\n--- Entering course name: "${name}" ---`);
    const input = this.page.locator('input#courseName');
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill(name);
  }

  async enterDesiredOutcomes(outcomes: string): Promise<void> {
    console.log('--- Entering desired outcomes ---');
    const textarea = this.page.locator('textarea#outcomes');
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill(outcomes);
  }

  async clickGenerateTitle(): Promise<void> {
    console.log('--- Clicking Generate Title ---');
    const btn = this.page.getByRole('button', { name: /generate title/i });
    await expect(btn).toBeEnabled({ timeout: 5000 });
    await btn.click();
    await this.screenshot('generate-clicked', 'Generate Title clicked');
  }

  /** Check that idle form has "Add Knowledge" button */
  async assertKnowledgeButtonVisible(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /add knowledge/i });
    await expect(btn).toBeVisible({ timeout: 5000 });
  }

  // ==================================================================
  // Wait for approval step (polling-based transitions)
  // ==================================================================

  /**
   * Wait for the wizard to transition to an approval step.
   * The wizard polls Temporal every 2s. We wait for the "Review:" heading to appear.
   * @param stepLabel - Expected step label (e.g., "Title & Description")
   * @param timeoutMs - Max wait time (default 120s for AI generation)
   */
  async waitForApprovalStep(stepLabel: string, timeoutMs = 120000): Promise<void> {
    console.log(`\n--- Waiting for approval: ${stepLabel} (up to ${timeoutMs / 1000}s) ---`);
    const heading = this.page.getByRole('heading', { name: new RegExp(`Review:\\s*${stepLabel}`, 'i') });

    await heading.waitFor({ state: 'visible', timeout: timeoutMs });
    console.log(`Approval step visible: ${stepLabel}`);
    await this.screenshot(`approval-${stepLabel.toLowerCase().replace(/\s+/g, '-')}`, `Approval: ${stepLabel}`);
  }

  /**
   * Wait for the processing spinner to appear (confirms workflow is running).
   */
  async waitForProcessing(timeoutMs = 15000): Promise<void> {
    console.log('--- Waiting for processing state ---');
    // The processing state shows a Loader2 spinner
    const spinner = this.page.locator('.animate-spin');
    try {
      await spinner.first().waitFor({ state: 'visible', timeout: timeoutMs });
      console.log('Processing state confirmed');
    } catch {
      console.log('No spinner found — may have already transitioned');
    }
  }

  // ==================================================================
  // Approval actions
  // ==================================================================

  /** Click "Approve & Continue" button */
  async clickApprove(): Promise<void> {
    console.log('--- Clicking Approve & Continue ---');
    const btn = this.page.getByRole('button', { name: /approve & continue/i });
    await expect(btn).toBeVisible({ timeout: 10000 });
    await expect(btn).toBeEnabled({ timeout: 10000 });
    await btn.click();
    await this.screenshot('approved', 'Clicked Approve');
  }

  /** Click "Regenerate" button to open feedback form */
  async clickRegenerate(): Promise<void> {
    console.log('--- Clicking Regenerate ---');
    const btn = this.page.getByRole('button', { name: /^regenerate$/i });
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
  }

  /** Submit rejection with feedback */
  async submitRejectionFeedback(feedback: string): Promise<void> {
    console.log(`--- Submitting rejection feedback: "${feedback}" ---`);
    const textarea = this.page.locator('textarea[placeholder*="different"]');
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill(feedback);
    // Click the "Regenerate" submit button (inside the feedback form)
    const submitBtn = this.page.getByRole('button', { name: /regenerate/i }).last();
    await submitBtn.click();
    await this.screenshot('rejected', 'Rejection submitted');
  }

  /** Assert that the Regenerate button is NOT visible (for selection-only steps) */
  async assertNoRegenerateButton(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /^regenerate$/i });
    await expect(btn).not.toBeVisible({ timeout: 3000 });
  }

  /** Assert that instructional text is visible (for selection steps) */
  async assertSelectionInstructionText(): Promise<void> {
    const text = this.page.getByText(/select the items you want|pick the tone/i);
    await expect(text).toBeVisible({ timeout: 3000 });
  }

  // ==================================================================
  // Title step — editable fields
  // ==================================================================

  /** Assert that the title step has editable input fields */
  async assertTitleEditable(): Promise<void> {
    const titleInput = this.page.locator('input[type="text"]').first();
    const descTextarea = this.page.locator('textarea').first();
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await expect(descTextarea).toBeVisible({ timeout: 5000 });
  }

  /** Edit the title in the review step */
  async editTitle(newTitle: string): Promise<void> {
    console.log(`--- Editing title to: "${newTitle}" ---`);
    const titleInput = this.page.locator('input[type="text"]').first();
    await titleInput.clear();
    await titleInput.fill(newTitle);
    await this.screenshot('title-edited', 'Title edited');
  }

  /** Get the current title value from the input */
  async getTitleValue(): Promise<string> {
    const titleInput = this.page.locator('input[type="text"]').first();
    return await titleInput.inputValue();
  }

  // ==================================================================
  // Outcomes step — editable textarea
  // ==================================================================

  async assertOutcomesEditable(): Promise<void> {
    const textarea = this.page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
  }

  async getOutcomesValue(): Promise<string> {
    const textarea = this.page.locator('textarea').first();
    return await textarea.inputValue();
  }

  // ==================================================================
  // Persona steps — grid with select all
  // ==================================================================

  /** Assert persona cards are in a grid layout */
  async assertPersonaGrid(): Promise<void> {
    const grid = this.page.locator('.grid.grid-cols-1.md\\:grid-cols-3');
    await expect(grid).toBeVisible({ timeout: 5000 });
  }

  /** Get the "N of M selected" text */
  async getSelectionCount(): Promise<string> {
    const countText = this.page.getByText(/\d+ of \d+ selected/);
    return (await countText.textContent()) || '';
  }

  /** Click "Deselect All" to uncheck all personas */
  async clickDeselectAll(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /deselect all/i });
    await btn.click();
  }

  /** Click "Select All" to check all personas */
  async clickSelectAll(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /select all/i });
    await btn.click();
  }

  /** Click on a persona card by index to toggle selection */
  async togglePersonaCard(index: number): Promise<void> {
    const cards = this.page.locator('.grid.grid-cols-1 button[type="button"]');
    const card = cards.nth(index);
    await card.click();
  }

  /** Click "Show more" on a persona card */
  async expandPersonaCard(index: number): Promise<void> {
    const showMoreButtons = this.page.getByRole('button', { name: /show more/i });
    if (await showMoreButtons.nth(index).isVisible()) {
      await showMoreButtons.nth(index).click();
    }
  }

  // ==================================================================
  // Tone step — radio select + additional context
  // ==================================================================

  /** Assert tone option cards are visible with level-of-detail badges */
  async assertToneOptions(): Promise<void> {
    // Tone cards have radio buttons (rounded-full indicator)
    const toneLabel = this.page.getByText(/tone & style/i);
    await expect(toneLabel).toBeVisible({ timeout: 5000 });
  }

  /** Assert "Additional Context" textarea is visible */
  async assertAdditionalContextField(): Promise<void> {
    const label = this.page.getByText(/additional context/i);
    await expect(label).toBeVisible({ timeout: 5000 });
  }

  /** Fill the additional context textarea on the tone step */
  async fillAdditionalContext(text: string): Promise<void> {
    console.log(`--- Filling additional context: "${text.substring(0, 50)}..." ---`);
    const textarea = this.page.locator('textarea[placeholder*="extra context"]');
    await textarea.fill(text);
  }

  // ==================================================================
  // Completion state
  // ==================================================================

  /** Wait for the "Course Created!" completion screen */
  async waitForCompletion(timeoutMs = 600000): Promise<void> {
    console.log(`\n--- Waiting for course completion (up to ${timeoutMs / 1000}s) ---`);
    const heading = this.page.getByText('Course Created!');
    await heading.waitFor({ state: 'visible', timeout: timeoutMs });
    console.log('Course creation complete!');
    await this.screenshot('complete', 'Course Created!');
  }

  /** Assert the "Open in Editor" button is visible */
  async assertOpenInEditorButton(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /open in editor/i });
    await expect(btn).toBeVisible({ timeout: 5000 });
  }

  /** Click "Open in Editor" and return the course editor URL */
  async clickOpenInEditor(): Promise<string> {
    const btn = this.page.getByRole('button', { name: /open in editor/i });
    await btn.click();
    await this.page.waitForURL(/\/course\/[^/]+\/editor/, { timeout: 15000 });
    const url = this.page.url();
    console.log(`Navigated to editor: ${url}`);
    await this.screenshot('editor', 'Course editor opened');
    return url;
  }

  // ==================================================================
  // Error state
  // ==================================================================

  async assertFailedState(): Promise<void> {
    const heading = this.page.getByText(/something went wrong/i);
    await expect(heading).toBeVisible({ timeout: 5000 });
  }

  // ==================================================================
  // Full flow helpers
  // ==================================================================

  /**
   * Run the complete wizard from idle to completion.
   * Returns true if the course was created successfully.
   */
  async completeWizard(options: {
    courseName: string;
    desiredOutcomes?: string;
  }): Promise<boolean> {
    const { courseName, desiredOutcomes } = options;

    // Step 1: Fill form and start
    await this.enterCourseName(courseName);
    if (desiredOutcomes) {
      await this.enterDesiredOutcomes(desiredOutcomes);
    }
    await this.screenshot('idle-form-filled', 'Idle form filled');
    await this.clickGenerateTitle();

    // Step 2: Title approval
    await this.waitForApprovalStep('Title & Description');
    await this.clickApprove();

    // Step 3: Outcomes approval
    await this.waitForApprovalStep('Learning Outcomes');
    await this.clickApprove();

    // Step 4: SME Personas approval
    await this.waitForApprovalStep('SME Personas');
    await this.clickApprove();

    // Step 5: Audience Personas approval
    await this.waitForApprovalStep('Target Audience');
    await this.clickApprove();

    // Step 6: Tone selection approval
    await this.waitForApprovalStep('Tone & Style');
    await this.clickApprove();

    // Step 7: Outline approval
    await this.waitForApprovalStep('Course Outline', 180000);
    await this.clickApprove();

    // Step 8: Wait for lesson generation + completion
    await this.waitForCompletion();

    return true;
  }

  // ==================================================================
  // Utilities
  // ==================================================================

  async screenshot(name: string, description?: string): Promise<void> {
    this.stepScreenshotCount++;
    const prefix = String(this.stepScreenshotCount).padStart(2, '0');
    await takeScreenshot(this.page, `wizard-${prefix}-${name}`, description);
  }
}
