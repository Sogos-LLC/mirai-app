import { Page, expect } from '@playwright/test';
import { takeScreenshot } from '../helpers';
import { TIMEOUTS } from '../config';

/**
 * Page Object for the Unified Course Creation Wizard (Temporal-based).
 *
 * Enterprise SLA: every AI step must resolve within 30s.
 * Any wait exceeding 30s is a test failure — review screenshots and fix.
 *
 * Flow: Idle → Title → Outcomes → SME Personas → Audience Personas → Tone → Outline → Lessons → Complete
 */
export class WizardPage {
  private stepScreenshotCount = 0;

  constructor(private page: Page) {}

  // ==================================================================
  // Navigation
  // ==================================================================

  async goto(): Promise<void> {
    await this.page.goto('/course/wizard', { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(TIMEOUTS.uiTransition);
    await this.screenshot('start', 'Wizard page loaded');
  }

  // ==================================================================
  // Stepper assertions
  // ==================================================================

  async assertStepperLabels(): Promise<void> {
    const nav = this.page.locator('nav[aria-label="Wizard progress"]');
    await expect(nav).toBeVisible({ timeout: TIMEOUTS.elementVisible });

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
    await expect(input).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await input.fill(name);
  }

  async enterDesiredOutcomes(outcomes: string): Promise<void> {
    console.log('--- Entering desired outcomes ---');
    const textarea = this.page.locator('textarea#outcomes');
    await expect(textarea).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await textarea.fill(outcomes);
  }

  async clickGenerateTitle(): Promise<void> {
    console.log('--- Clicking Generate Title ---');
    const btn = this.page.getByRole('button', { name: /generate title/i });
    await expect(btn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
    await btn.click();
    await this.screenshot('generate-clicked', 'Generate Title clicked');
  }

  async assertKnowledgeButtonVisible(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /add knowledge/i });
    await expect(btn).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  }

  // ==================================================================
  // Wait for approval step (30s SLA per step)
  // ==================================================================

  /**
   * Wait for the wizard to transition to an approval step.
   * Enforces 30s SLA — if AI generation takes longer, the test fails.
   */
  async waitForApprovalStep(stepLabel: string): Promise<void> {
    console.log(`\n--- Waiting for approval: ${stepLabel} (30s SLA) ---`);
    const heading = this.page.getByRole('heading', { name: new RegExp(`Review:\\s*${stepLabel}`, 'i') });

    await heading.waitFor({ state: 'visible', timeout: TIMEOUTS.aiGeneration });
    console.log(`Approval step visible: ${stepLabel}`);
    await this.screenshot(`approval-${stepLabel.toLowerCase().replace(/\s+/g, '-')}`, `Approval: ${stepLabel}`);
  }

  /**
   * Wait for the processing spinner to appear (confirms workflow is running).
   */
  async waitForProcessing(): Promise<void> {
    console.log('--- Waiting for processing state ---');
    const spinner = this.page.locator('.animate-spin');
    try {
      await spinner.first().waitFor({ state: 'visible', timeout: TIMEOUTS.elementVisible });
      console.log('Processing state confirmed');
    } catch {
      console.log('No spinner found — may have already transitioned');
    }
  }

  // ==================================================================
  // Approval actions
  // ==================================================================

  async clickApprove(): Promise<void> {
    console.log('--- Clicking Approve & Continue ---');
    const btn = this.page.getByRole('button', { name: /approve & continue/i });
    await expect(btn).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(btn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
    await btn.click();
    await this.screenshot('approved', 'Clicked Approve');
  }

  async clickRegenerate(): Promise<void> {
    console.log('--- Clicking Regenerate ---');
    const btn = this.page.getByRole('button', { name: /^regenerate$/i });
    await expect(btn).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await btn.click();
  }

  async submitRejectionFeedback(feedback: string): Promise<void> {
    console.log(`--- Submitting rejection feedback: "${feedback}" ---`);
    const textarea = this.page.locator('textarea[placeholder*="different"]');
    await expect(textarea).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await textarea.fill(feedback);
    const submitBtn = this.page.getByRole('button', { name: /regenerate/i }).last();
    await submitBtn.click();
    await this.screenshot('rejected', 'Rejection submitted');
  }

  async assertNoRegenerateButton(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /^regenerate$/i });
    await expect(btn).not.toBeVisible({ timeout: 3000 });
  }

  async assertSelectionInstructionText(): Promise<void> {
    const text = this.page.getByText(/select the items you want|pick the tone/i);
    await expect(text).toBeVisible({ timeout: 3000 });
  }

  // ==================================================================
  // Title step — editable fields
  // ==================================================================

  async assertTitleEditable(): Promise<void> {
    const titleInput = this.page.locator('input[type="text"]').first();
    const descTextarea = this.page.locator('textarea').first();
    await expect(titleInput).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(descTextarea).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  }

  async editTitle(newTitle: string): Promise<void> {
    console.log(`--- Editing title to: "${newTitle}" ---`);
    const titleInput = this.page.locator('input[type="text"]').first();
    await titleInput.clear();
    await titleInput.fill(newTitle);
    await this.screenshot('title-edited', 'Title edited');
  }

  async getTitleValue(): Promise<string> {
    const titleInput = this.page.locator('input[type="text"]').first();
    return await titleInput.inputValue();
  }

  // ==================================================================
  // Outcomes step — editable textarea
  // ==================================================================

  async assertOutcomesEditable(): Promise<void> {
    const textarea = this.page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  }

  async getOutcomesValue(): Promise<string> {
    const textarea = this.page.locator('textarea').first();
    return await textarea.inputValue();
  }

  // ==================================================================
  // Persona steps — grid with select all
  // ==================================================================

  async assertPersonaGrid(): Promise<void> {
    const grid = this.page.locator('.grid.grid-cols-1.md\\:grid-cols-3');
    await expect(grid).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  }

  async getSelectionCount(): Promise<string> {
    const countText = this.page.getByText(/\d+ of \d+ selected/);
    return (await countText.textContent()) || '';
  }

  async clickDeselectAll(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /deselect all/i });
    await btn.click();
  }

  async clickSelectAll(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /select all/i });
    await btn.click();
  }

  async togglePersonaCard(index: number): Promise<void> {
    const cards = this.page.locator('.grid.grid-cols-1 button[type="button"]');
    const card = cards.nth(index);
    await card.click();
  }

  async expandPersonaCard(index: number): Promise<void> {
    const showMoreButtons = this.page.getByRole('button', { name: /show more/i });
    if (await showMoreButtons.nth(index).isVisible()) {
      await showMoreButtons.nth(index).click();
    }
  }

  // ==================================================================
  // Tone step — radio select + additional context
  // ==================================================================

  async assertToneOptions(): Promise<void> {
    const toneLabel = this.page.getByText(/tone & style/i);
    await expect(toneLabel).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  }

  async assertAdditionalContextField(): Promise<void> {
    const label = this.page.getByText(/additional context/i);
    await expect(label).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  }

  async fillAdditionalContext(text: string): Promise<void> {
    console.log(`--- Filling additional context: "${text.substring(0, 50)}..." ---`);
    const textarea = this.page.locator('textarea[placeholder*="extra context"]');
    await textarea.fill(text);
  }

  // ==================================================================
  // Completion state (30s SLA — lessons auto-generated by workflow)
  // ==================================================================

  /** Wait for the "Course Created!" completion screen (30s SLA) */
  async waitForCompletion(): Promise<void> {
    console.log('\n--- Waiting for course completion (30s SLA) ---');
    const heading = this.page.getByText('Course Created!');
    await heading.waitFor({ state: 'visible', timeout: TIMEOUTS.aiGeneration });
    console.log('Course creation complete!');
    await this.screenshot('complete', 'Course Created!');
  }

  async assertOpenInEditorButton(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /open in editor/i });
    await expect(btn).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  }

  async clickOpenInEditor(): Promise<string> {
    const btn = this.page.getByRole('button', { name: /open in editor/i });
    await btn.click();
    await this.page.waitForURL(/\/course\/[^/]+\/editor/, { timeout: TIMEOUTS.navigation });
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
    await expect(heading).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  }

  // ==================================================================
  // Full flow helpers
  // ==================================================================

  /**
   * Run the complete wizard from idle to completion.
   * Each step enforces 30s SLA. Total max ~4 min for 8 steps.
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

    // Step 2: Title approval (30s SLA)
    await this.waitForApprovalStep('Title & Description');
    await this.clickApprove();

    // Step 3: Outcomes approval (30s SLA)
    await this.waitForApprovalStep('Learning Outcomes');
    await this.clickApprove();

    // Step 4: SME Personas approval (30s SLA)
    await this.waitForApprovalStep('SME Personas');
    await this.clickApprove();

    // Step 5: Audience Personas approval (30s SLA)
    await this.waitForApprovalStep('Target Audience');
    await this.clickApprove();

    // Step 6: Tone selection approval (30s SLA)
    await this.waitForApprovalStep('Tone & Style');
    await this.clickApprove();

    // Step 7: Outline approval (30s SLA)
    await this.waitForApprovalStep('Course Outline');
    await this.clickApprove();

    // Step 8: Wait for lesson generation + completion (30s SLA)
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
