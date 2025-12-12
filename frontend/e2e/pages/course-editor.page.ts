import { Page, expect } from '@playwright/test';
import { takeScreenshot } from '../helpers';
import { TIMEOUTS, PATHS } from '../config';

/**
 * Page Object for the Course Editor (/course/{id}/editor).
 * This is the component-based editor that uses LessonComponent types
 * including IMAGE components with AI generation capability.
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
    // Wait for loading spinner to disappear (if visible)
    const loadingSpinner = this.page.getByText('Loading course...');
    try {
      await loadingSpinner.waitFor({ state: 'visible', timeout: 2000 });
      // Spinner is visible, wait for it to disappear
      await loadingSpinner.waitFor({ state: 'hidden', timeout: TIMEOUTS.backgroundJob });
    } catch {
      // Spinner wasn't visible, content may already be loaded
    }

    // Wait for "Course Outline" text to appear (indicates editor loaded)
    await expect(
      this.page.getByText('Course Outline')
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

  /** Get the sidebar element */
  private get sidebar() {
    return this.page.locator('aside');
  }

  /** Expand first section if collapsed (only if no lessons are visible) */
  async expandFirstSection(): Promise<void> {
    // Check if any lessons are already visible (look for FileText icons in nav buttons)
    // Lessons have text like "End-to-End Testing", "The Importance of", etc.
    const visibleLessons = this.sidebar.getByRole('button', { name: /End-to-End Testing|Importance|Navigating|Setting Up/i });
    const lessonCount = await visibleLessons.count();

    if (lessonCount > 0) {
      console.log(`Found ${lessonCount} lessons already visible, section is expanded`);
      return; // Section already expanded
    }

    // No lessons visible, need to expand a section
    const sectionHeaders = this.sidebar.locator('button').filter({
      hasText: /Introduction|Defining|Building|Implementing|Advanced/,
    });

    const count = await sectionHeaders.count();
    console.log(`Found ${count} section headers, no lessons visible - expanding first`);

    if (count > 0) {
      await sectionHeaders.first().click();
      await this.page.waitForTimeout(TIMEOUTS.uiTransition);
      console.log('Clicked first section to expand');
    }
  }

  /** Click on a lesson by index (0-based) */
  async selectLessonByIndex(index: number): Promise<void> {
    // Ensure sections are expanded
    await this.expandFirstSection();

    // Find lessons by looking for buttons that match lesson patterns (not section headers)
    const lessonButtons = this.sidebar.getByRole('button', {
      name: /End-to-End Testing|Importance|Navigating|Setting Up/i,
    });

    const lessonCount = await lessonButtons.count();
    console.log(`Found ${lessonCount} lesson buttons`);

    if (lessonCount > 0) {
      const targetIndex = Math.min(index, lessonCount - 1);
      const lessonText = await lessonButtons.nth(targetIndex).textContent();
      console.log(`Clicking lesson ${targetIndex}: "${lessonText?.substring(0, 40)}..."`);

      await lessonButtons.nth(targetIndex).click();
      await this.page.waitForTimeout(TIMEOUTS.uiTransition);

      // Wait for lesson content to load - "Select a Lesson" should disappear
      try {
        await this.page.getByText('Select a Lesson').waitFor({ state: 'hidden', timeout: 15000 });
        console.log('Lesson content loaded');
      } catch {
        console.log('Warning: "Select a Lesson" still visible after clicking');
      }

      await this.screenshot(`lesson-${targetIndex}-selected`, `Selected lesson ${targetIndex}`);
      return;
    }

    throw new Error('No lessons found in sidebar');
  }

  /** Click on the first lesson */
  async selectFirstLesson(): Promise<void> {
    await this.selectLessonByIndex(0);
  }

  // ===== Component Interaction =====

  /** Click "Add Component" button */
  async clickAddComponent(): Promise<void> {
    const addButton = this.page.getByRole('button', { name: /Add Component/i });
    await expect(addButton).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await addButton.click();
    await this.page.waitForTimeout(500); // Wait for menu to appear
    console.log('Clicked Add Component button');
  }

  /** Select Image from the component type menu */
  async selectImageFromMenu(): Promise<void> {
    // Look for "Image" option in the dropdown/bottom sheet
    const imageOption = this.page.getByRole('button', { name: /^Image$/i }).or(
      this.page.locator('button').filter({ hasText: /^Image$/ })
    );
    await expect(imageOption).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await imageOption.click();
    console.log('Selected Image from component menu');
    await this.page.waitForTimeout(TIMEOUTS.uiTransition);
  }

  /** Add a new Image component */
  async addImageComponent(): Promise<void> {
    await this.clickAddComponent();
    await this.selectImageFromMenu();
    await this.screenshot('image-component-added', 'Added new image component');
  }

  /** Find image placeholder components in the lesson content */
  async findImagePlaceholders() {
    // Image placeholders show "Image Placeholder" text with purple styling
    return this.page.locator('p').filter({ hasText: 'Image Placeholder' });
  }

  /** Click on the first image component/placeholder to open edit modal */
  async openFirstImageComponent(): Promise<boolean> {
    // First check for Image Placeholder text (from ComponentRenderer)
    const placeholders = await this.findImagePlaceholders();
    const count = await placeholders.count();
    console.log(`Found ${count} image placeholders`);

    if (count > 0) {
      // Click on the parent container of the placeholder
      await placeholders.first().click();
      await this.page.waitForTimeout(TIMEOUTS.uiTransition);
      await this.screenshot('image-modal-opened', 'Image editor modal opened');
      return true;
    }

    // Fallback - look for any clickable area with image-related content
    const imageComponents = this.page.locator('[class*="image"]').filter({
      has: this.page.locator('svg'),
    });
    const imageCount = await imageComponents.count();

    if (imageCount > 0) {
      await imageComponents.first().click();
      await this.page.waitForTimeout(TIMEOUTS.uiTransition);
      await this.screenshot('image-modal-opened', 'Image editor modal opened via fallback');
      return true;
    }

    console.log('No image components found');
    return false;
  }

  // ===== Image Generation (in Edit Modal) =====

  /** Check if the edit modal is open */
  async isEditModalOpen(): Promise<boolean> {
    const modalTitle = this.page.getByRole('heading', { name: /Edit Image/i });
    return modalTitle.isVisible();
  }

  /** Wait for the edit modal to open */
  async waitForEditModal(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: /Edit Image/i })
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    console.log('Edit Image modal is open');
  }

  /** Fill in the image description for AI generation */
  async fillImageDescription(description: string): Promise<void> {
    // The textarea is in the AI Image Generation section
    const textarea = this.page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await textarea.fill(description);
    console.log(`Filled image description: "${description.substring(0, 50)}..."`);
    await this.screenshot('description-filled', 'Image description entered');
  }

  /** Click the "Generate Image" button */
  async clickGenerateImage(): Promise<void> {
    const generateBtn = this.page.getByRole('button', { name: /Generate Image/i });
    await expect(generateBtn).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(generateBtn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
    console.log('Clicking Generate Image button...');
    await generateBtn.click();
  }

  /** Wait for image generation result (success or error) in the modal */
  async waitForImageGenerationResult(): Promise<{
    success: boolean;
    error?: string;
    imageUrl?: string;
  }> {
    console.log('Waiting for image generation result in modal...');
    await this.screenshot('generating', 'Image generation in progress');

    try {
      // Strategy: Wait for the Generate Image button to become enabled again
      // When generating, the button shows "Generating..." and is disabled
      // When done, it shows "Generate Image" and is enabled (or image appears)

      const generateButton = this.page.getByRole('button', { name: /Generate Image/i });

      // Poll until either:
      // 1. Button says "Generate Image" (not "Generating...") = done
      // 2. An image with minio URL appears = success
      // 3. Error message appears = failure
      // 4. Timeout = failure

      const startTime = Date.now();
      const maxWaitMs = TIMEOUTS.backgroundJob; // 180 seconds

      while (Date.now() - startTime < maxWaitMs) {
        // Check for error first
        const errorVisible = await this.page.locator('text=Failed to generate image').isVisible().catch(() => false);
        if (errorVisible) {
          console.log('Error message detected');
          await this.screenshot('error', 'Image generation error');
          return { success: false, error: 'Failed to generate image' };
        }

        // Check if image appeared (success case)
        const imageLocator = this.page.locator('figure img').first();
        const imageVisible = await imageLocator.isVisible().catch(() => false);
        if (imageVisible) {
          const src = await imageLocator.getAttribute('src');
          if (src && (src.includes('minio') || src.startsWith('https://'))) {
            console.log('Image appeared in modal!', src);
            // Wait a moment for React state to settle (isGenerating -> false)
            // This allows the Save Changes button to become enabled
            await this.page.waitForTimeout(1500);
            await this.screenshot('success', 'Image generated successfully');
            return { success: true, imageUrl: src };
          }
        }

        // Check if button is no longer in "Generating..." state
        const buttonText = await generateButton.textContent().catch(() => '');
        const isGenerating = buttonText?.toLowerCase().includes('generating');

        if (!isGenerating && buttonText?.toLowerCase().includes('generate')) {
          // Button is back to normal, check for image one more time
          console.log('Generate button back to normal state');
          await this.page.waitForTimeout(500);

          const finalImageCheck = this.page.locator('figure img').first();
          if (await finalImageCheck.isVisible().catch(() => false)) {
            const src = await finalImageCheck.getAttribute('src');
            if (src && (src.includes('minio') || src.startsWith('https://'))) {
              console.log('Image found after generation complete:', src);
              await this.screenshot('success', 'Image generated');
              return { success: true, imageUrl: src };
            }
          }
        }

        // Log progress every 10 seconds
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        if (elapsed % 10 === 0 && elapsed > 0) {
          console.log(`Still waiting for image generation... ${elapsed}s elapsed`);
        }

        await this.page.waitForTimeout(1000); // Poll every second
      }

      // Timeout reached
      await this.screenshot('timeout', 'Image generation timeout');
      return { success: false, error: 'Timeout waiting for image generation' };

    } catch (e) {
      console.error('Error during wait:', e);
      await this.screenshot('error', 'Unexpected error');
      return { success: false, error: `Unexpected error: ${e}` };
    }
  }

  /**
   * Complete image generation flow:
   * 1. Select a lesson
   * 2. Add an image component
   * 3. Fill in description
   * 4. Generate
   * 5. Wait for result
   */
  async generateImage(prompt: string): Promise<{
    success: boolean;
    error?: string;
    imageUrl?: string;
  }> {
    // Select first lesson if not already selected
    const selectLessonVisible = await this.page.getByText('Select a Lesson').isVisible();
    if (selectLessonVisible) {
      await this.selectFirstLesson();
    }

    // Add an image component
    await this.addImageComponent();

    // Modal should auto-open after adding component
    await this.waitForEditModal();

    // Fill in the description
    await this.fillImageDescription(prompt);

    // Click generate
    await this.clickGenerateImage();

    // Wait for result
    return this.waitForImageGenerationResult();
  }

  /** Close the edit modal */
  async closeEditModal(): Promise<void> {
    // Look for close button or press Escape
    const closeButton = this.page.locator('button[aria-label*="Close"], button[aria-label*="close"]');
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.page.waitForTimeout(500);
  }

  /** Verify the modal is still open (for testing that auto-close is NOT happening) */
  async verifyModalStillOpen(): Promise<boolean> {
    const modalTitle = this.page.getByRole('heading', { name: /Edit Image/i });
    const isOpen = await modalTitle.isVisible();
    console.log(`Modal is ${isOpen ? 'STILL OPEN' : 'CLOSED'} after image generation`);
    return isOpen;
  }

  /** Save the current component changes (in modal) */
  async saveChanges(): Promise<void> {
    const saveButton = this.page.getByRole('button', { name: /Save Changes/i });
    await expect(saveButton).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // Wait for button to be enabled (after generation completes, isGenerating becomes false)
    await expect(saveButton).toBeEnabled({ timeout: 10000 });
    await saveButton.click();
    console.log('Clicked Save Changes in modal');
    await this.page.waitForTimeout(TIMEOUTS.uiTransition);
  }

  /** Save the lesson using the top-level Save button */
  async saveLesson(): Promise<void> {
    // The Save button is in the header, distinct from modal's "Save Changes"
    // It only appears when there are unsaved changes
    const saveButton = this.page.locator('header button, div button').filter({ hasText: /^Save$/ }).first();

    // Check if the button is visible and enabled
    if (await saveButton.isVisible()) {
      const isDisabled = await saveButton.isDisabled();
      if (isDisabled) {
        console.log('Save button is disabled - component already saved via UpdateLessonComponents');
        return;
      }
      await saveButton.click();
      console.log('Clicked Save button to persist lesson');
      // Wait for save API call to complete
      await this.page.waitForTimeout(3000);
    } else {
      console.log('Save button not visible - no changes to save');
    }
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
