import { Page, expect } from '@playwright/test';
import { takeScreenshot } from '../helpers';
import { TIMEOUTS, PATHS } from '../config';

/**
 * Page Object for the Course Editor.
 * Handles lesson navigation, component interactions, and image generation.
 */
export class CourseEditorPage {
  private screenshotCount = 0;

  constructor(private page: Page) {}

  /** Navigate to a course editor by ID */
  async goto(courseId: string): Promise<void> {
    await this.page.goto(PATHS.courseEditor(courseId), { waitUntil: 'domcontentloaded' });
    await this.waitForEditorLoad();
  }

  /** Wait for the editor to fully load */
  async waitForEditorLoad(): Promise<void> {
    // Wait for the lesson sidebar or editor content to appear
    await expect(
      this.page.locator('[class*="sidebar"], [class*="lesson-list"], [class*="editor"]').first()
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await this.page.waitForTimeout(TIMEOUTS.uiTransition);
  }

  /** Get the current course ID from URL */
  getCurrentCourseId(): string | null {
    const url = this.page.url();
    const match = url.match(/\/course\/([^/]+)/);
    return match ? match[1] : null;
  }

  // ===== Lesson Navigation =====

  /** Get all lesson items in the sidebar */
  async getLessonItems() {
    return this.page.locator('[class*="lesson-item"], [data-lesson-id], .lesson-nav-item');
  }

  /** Click on a lesson by index (0-based) */
  async selectLessonByIndex(index: number): Promise<void> {
    const lessons = await this.getLessonItems();
    const count = await lessons.count();

    if (index >= count) {
      throw new Error(`Lesson index ${index} out of range (${count} lessons)`);
    }

    await lessons.nth(index).click();
    await this.page.waitForTimeout(TIMEOUTS.uiTransition);
    await this.screenshot(`lesson-${index}-selected`, `Selected lesson ${index}`);
  }

  /** Click on the first lesson */
  async selectFirstLesson(): Promise<void> {
    await this.selectLessonByIndex(0);
  }

  // ===== Component Interaction =====

  /** Find all image components/placeholders in the current lesson */
  async getImageComponents() {
    return this.page.locator(
      '[data-component-type="image"], [class*="image-placeholder"], [class*="ImageComponent"]'
    );
  }

  /** Find image components by looking for image-related text or icons */
  async findImagePlaceholders() {
    // Image placeholders might have specific text or icons
    return this.page.locator('button, div').filter({
      has: this.page.locator('[class*="image"], svg[class*="image"]'),
    });
  }

  /** Click on the first image component to open the editor modal */
  async openFirstImageComponent(): Promise<boolean> {
    const imageComponents = await this.getImageComponents();
    let count = await imageComponents.count();

    // Fallback to placeholder search
    if (count === 0) {
      const placeholders = await this.findImagePlaceholders();
      count = await placeholders.count();

      if (count > 0) {
        await placeholders.first().click();
        await this.page.waitForTimeout(TIMEOUTS.uiTransition);
        await this.screenshot('image-modal-opened', 'Image editor modal opened');
        return true;
      }
    } else {
      await imageComponents.first().click();
      await this.page.waitForTimeout(TIMEOUTS.uiTransition);
      await this.screenshot('image-modal-opened', 'Image editor modal opened');
      return true;
    }

    console.log('No image components found');
    return false;
  }

  // ===== Image Generation =====

  /** Check if the image editor modal is open */
  async isImageModalOpen(): Promise<boolean> {
    const modal = this.page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]');
    return modal.isVisible();
  }

  /** Fill in the image generation prompt */
  async fillImagePrompt(prompt: string): Promise<void> {
    const textarea = this.page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await textarea.fill(prompt);
    await this.screenshot('prompt-filled', 'Image prompt entered');
  }

  /** Click the generate image button */
  async clickGenerateImage(): Promise<void> {
    const generateBtn = this.page.getByRole('button', { name: /generate.*image|create.*image/i });
    await expect(generateBtn).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    console.log('Clicking Generate Image button...');
    await generateBtn.click();
  }

  /** Wait for image generation result (success or error) */
  async waitForImageGenerationResult(): Promise<{
    success: boolean;
    error?: string;
    imageUrl?: string;
  }> {
    console.log('Waiting for image generation result...');
    await this.screenshot('generating', 'Image generation in progress');

    try {
      // Wait for either success (image appears) or error message
      await Promise.race([
        // Success: an image appears
        this.page.locator('img[src*="generated"], img[src*="minio"], img[src*="blob"]').waitFor({
          state: 'visible',
          timeout: TIMEOUTS.backgroundJob,
        }),
        // Error: error message appears
        this.page.locator('[class*="error"], [class*="Error"], [role="alert"]').waitFor({
          state: 'visible',
          timeout: TIMEOUTS.backgroundJob,
        }),
      ]);
    } catch {
      await this.screenshot('timeout', 'Image generation timeout');
      return { success: false, error: 'Timeout waiting for image generation' };
    }

    await this.screenshot('result', 'Image generation result');

    // Check for error
    const errorElement = this.page.locator('[class*="error"], [class*="Error"], [role="alert"]');
    if (await errorElement.isVisible()) {
      const errorText = await errorElement.textContent();
      console.error('Image generation error:', errorText);
      return { success: false, error: errorText || 'Unknown error' };
    }

    // Check for success
    const image = this.page.locator('img[src*="generated"], img[src*="minio"], img[src*="blob"]');
    if (await image.isVisible()) {
      const imageUrl = await image.getAttribute('src');
      console.log('Image generated successfully:', imageUrl);
      return { success: true, imageUrl: imageUrl || undefined };
    }

    return { success: false, error: 'Unable to determine result' };
  }

  /**
   * Complete image generation flow:
   * 1. Open image component
   * 2. Fill prompt
   * 3. Generate
   * 4. Wait for result
   */
  async generateImage(prompt: string): Promise<{
    success: boolean;
    error?: string;
    imageUrl?: string;
  }> {
    const opened = await this.openFirstImageComponent();
    if (!opened) {
      return { success: false, error: 'No image component found' };
    }

    await this.fillImagePrompt(prompt);
    await this.clickGenerateImage();
    return this.waitForImageGenerationResult();
  }

  // ===== Utilities =====

  /** Take a screenshot with auto-incrementing prefix */
  async screenshot(name: string, description?: string): Promise<void> {
    this.screenshotCount++;
    const prefix = String(this.screenshotCount).padStart(2, '0');
    await takeScreenshot(this.page, `editor-${prefix}-${name}`, description);
  }

  /** Get current page URL */
  getUrl(): string {
    return this.page.url();
  }
}
