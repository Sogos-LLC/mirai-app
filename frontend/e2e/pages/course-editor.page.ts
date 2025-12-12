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

    // Wait for "Course Outline" heading to appear (indicates editor loaded)
    // Use getByRole to get the h3 heading specifically, not the mobile instruction text
    await expect(
      this.page.getByRole('heading', { name: 'Course Outline' })
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
    // Check if any lessons are already visible - lessons are child buttons under sections
    // Sections have chevron icons, lessons have file icons
    // Lessons don't contain section keywords like "Introduction", "Management", "Lifecycle", etc.

    // First, find all buttons in sidebar that are likely section headers (have chevrons/arrows)
    const allButtons = await this.sidebar.locator('button').all();

    // Try to find a collapsed section and expand it
    for (const btn of allButtons) {
      const text = await btn.textContent().catch(() => '');
      // Section headers tend to have broader topics
      if (
        text?.match(
          /Introduction|Management|Lifecycle|Quote-to-Cash|Post-Sale|Getting Started|Overview|Foundation|Advanced/i
        )
      ) {
        // Check if this section has a collapse/expand chevron (sections are expandable)
        const hasChevron = await btn.locator('svg').count();
        if (hasChevron > 0) {
          console.log(`Found section: "${text?.substring(0, 40)}..." - clicking to expand`);
          await btn.click();
          await this.page.waitForTimeout(TIMEOUTS.uiTransition);
          return;
        }
      }
    }

    console.log('No expandable sections found or already expanded');
  }

  /** Click on a lesson by index (0-based) */
  async selectLessonByIndex(index: number): Promise<void> {
    console.log(`Attempting to select lesson at index ${index}`);

    // Strategy: Find section buttons, expand one, then find nested lesson buttons
    // Sections are identified by having a chevron icon (svg) as direct child
    // Lessons are nested inside expanded sections and have a FileText icon

    // Wait for sidebar to be stable
    await this.page.waitForTimeout(500);

    // Desktop sidebar: aside element with nav inside
    const desktopNav = this.sidebar.locator('nav');
    const navExists = await desktopNav.count() > 0;

    if (!navExists) {
      console.log('Desktop nav not found, trying alternative approach');
    }

    // Find section buttons - they're the ones with chevron icons (ChevronRight or ChevronDown)
    // In this UI, sections have: button > svg(chevron) + span(title)
    const sectionLocator = navExists
      ? desktopNav.locator('button:has(svg)')
      : this.sidebar.locator('button:has(svg)');

    const sectionButtons = await sectionLocator.all();
    console.log(`Found ${sectionButtons.length} section buttons with chevron icons`);

    // Find a collapsed section and expand it
    let expandedSectionIndex = -1;
    for (let i = 0; i < sectionButtons.length; i++) {
      const btn = sectionButtons[i];
      const text = await btn.textContent().catch(() => '');

      // Skip "Course Outline" header
      if (text?.includes('Course Outline')) continue;

      // Check if section is collapsed (has ChevronRight, not ChevronDown)
      // ChevronRight has path d="m9 18 6-6-6-6" and ChevronDown has d="m6 9 6 6 6-6"
      const svgPath = await btn.locator('svg path').getAttribute('d').catch(() => '');

      const isCollapsed = svgPath?.includes('m9 18') || svgPath?.includes('9 18'); // ChevronRight pattern
      const isExpanded = svgPath?.includes('m6 9') || svgPath?.includes('6 9');  // ChevronDown pattern

      console.log(`Section ${i}: "${text?.substring(0, 30)}..." - collapsed: ${isCollapsed}, expanded: ${isExpanded}`);

      if (isCollapsed || (!isCollapsed && !isExpanded)) {
        // Click to expand this section
        console.log(`Expanding section: "${text?.substring(0, 40)}..."`);
        await btn.click();
        await this.page.waitForTimeout(1000); // Wait for expansion animation
        expandedSectionIndex = i;
        break;
      } else if (isExpanded) {
        // Section already expanded, use this one
        expandedSectionIndex = i;
        console.log(`Section already expanded: "${text?.substring(0, 40)}..."`);
        break;
      }
    }

    // Take screenshot after expansion
    await this.screenshot('after-expansion', 'After clicking section to expand');

    if (expandedSectionIndex < 0) {
      console.log('No sections found to expand, trying direct lesson search');
    }

    // Now find lesson buttons - they appear AFTER section expansion
    // Lessons have FileText icon (smaller indented buttons without chevrons)
    // Or we can look for buttons that appear in ml-4 divs (indented lessons)

    // Lessons are: button elements that are NOT section headers
    // They appear after a section is expanded and have FileText icon
    const allButtons = navExists
      ? await desktopNav.locator('button').all()
      : await this.sidebar.locator('button').all();

    const lessonButtons: typeof allButtons = [];

    console.log(`Total buttons after expansion: ${allButtons.length}`);

    for (const btn of allButtons) {
      const text = await btn.textContent().catch(() => '');

      // Skip empty or header buttons
      if (!text || text.includes('Course Outline') || text.trim().length < 3) {
        continue;
      }

      // Check if this button has a chevron (making it a section header)
      const hasChevron = await btn.locator('svg').first().evaluate(
        (svg) => {
          const path = svg.querySelector('path');
          const d = path?.getAttribute('d') || '';
          // Chevron patterns - ChevronRight or ChevronDown
          return d.includes('m9 18') || d.includes('m6 9') || d.includes('9 18') || d.includes('6 9');
        }
      ).catch(() => false);

      if (!hasChevron) {
        // This is likely a lesson (no chevron icon)
        lessonButtons.push(btn);
        console.log(`  Lesson found: "${text.substring(0, 50)}..."`);
      }
    }

    console.log(`Found ${lessonButtons.length} lesson buttons`);

    if (lessonButtons.length > 0) {
      const targetIndex = Math.min(index, lessonButtons.length - 1);
      const lessonText = await lessonButtons[targetIndex].textContent();
      console.log(`Clicking lesson ${targetIndex}: "${lessonText?.substring(0, 50)}..."`);

      await lessonButtons[targetIndex].click();
      await this.page.waitForTimeout(TIMEOUTS.uiTransition);

      // Wait for lesson content to load - "Select a Lesson" should disappear
      try {
        await this.page.getByText('Select a Lesson').waitFor({ state: 'hidden', timeout: 15000 });
        console.log('Lesson content loaded successfully');
      } catch {
        console.log('Warning: "Select a Lesson" still visible - lesson may not have loaded');
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

  // ===== Realignment Functionality =====

  /** Find the first text component (non-IMAGE) that supports realignment */
  async findFirstTextComponent() {
    // Components are in: main > CardContent > DndContext > SortableContext > div.space-y-4 > div.group/item > ...
    // The actual content wrapper with the 3-dot menu is div.group.relative inside each component
    // Look specifically in the component list area

    // First find the component list container
    const componentContainer = this.page.locator('main div.space-y-4');

    // Find all component wrappers (group/item is the outer, group.relative is the inner)
    // The 3-dot menu button with aria-label="Component options" is inside the inner wrapper
    const componentWrappers = componentContainer.locator('> div').filter({
      has: this.page.locator('button[aria-label="Component options"]'),
    });

    const count = await componentWrappers.count();
    console.log(`Found ${count} components with options menu`);

    if (count > 0) {
      // Get the first component that has text content (not just an image)
      for (let i = 0; i < count; i++) {
        const wrapper = componentWrappers.nth(i);
        // Check if this has text/prose content (not just an image)
        const hasText = await wrapper.locator('.prose, p, h1, h2, h3').count();
        const hasOnlyImage = await wrapper.locator('figure img, [class*="image-placeholder"]').count() > 0 &&
                            await wrapper.locator('.prose, p').count() === 0;

        if (hasText > 0 && !hasOnlyImage) {
          console.log(`Using component ${i} with text content`);
          return wrapper;
        }
      }

      // Fallback to first component
      console.log('Falling back to first component');
      return componentWrappers.first();
    }

    console.log('No components found with options menu');
    return null;
  }

  /** Get the text content of a component for comparison */
  async getComponentTextContent(component: ReturnType<typeof this.page.locator>): Promise<string> {
    // Try to get text from prose content
    const prose = component.locator('.prose');
    if (await prose.count() > 0) {
      return (await prose.first().textContent()) || '';
    }
    // Fallback to any text content
    return (await component.textContent()) || '';
  }

  /** Hover over a component and click the 3-dot menu */
  async openRealignmentMenu(component: ReturnType<typeof this.page.locator>): Promise<void> {
    // The options button is at top-right (top-2 right-2) INSIDE the component
    // The delete button is at bottom-right (-bottom-2 -right-2) OUTSIDE the component wrapper

    // First scroll the component into a good position in the viewport
    await component.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(500);

    // Take screenshot before attempting click
    await this.screenshot('before-menu-click', 'About to click options menu');

    // Hover over the component to reveal the options button
    // The button has opacity-0 by default and opacity-100 on group-hover
    await component.hover();
    await this.page.waitForTimeout(600); // Wait for opacity transition

    // Find the 3-dot menu button within this specific component
    const menuButton = component.locator('button[aria-label="Component options"]');

    // Verify button is visible
    const isVisible = await menuButton.isVisible();
    console.log(`Menu button visible: ${isVisible}`);

    if (!isVisible) {
      // Try hovering again closer to the top-right where the button is
      const box = await component.boundingBox();
      if (box) {
        // Hover at top-right area of component
        await this.page.mouse.move(box.x + box.width - 30, box.y + 20);
        await this.page.waitForTimeout(500);
      }
    }

    // Wait for button to be actionable
    await menuButton.waitFor({ state: 'visible', timeout: 5000 });

    // Use Playwright's click which handles scrolling and waiting
    // Use position to click center of button, avoiding any potential overlay issues
    try {
      await menuButton.click({ position: { x: 10, y: 10 }, timeout: 5000 });
      console.log('Clicked options menu button');
    } catch (e) {
      console.log('Standard click failed, trying with force');
      // As last resort, use force but on the correct button
      await menuButton.click({ force: true });
      console.log('Force clicked options menu button');
    }

    await this.page.waitForTimeout(300);

    // Verify the dropdown appeared
    const dropdown = component.locator('div.absolute.top-full');
    const dropdownVisible = await dropdown.isVisible().catch(() => false);
    console.log(`Dropdown menu visible: ${dropdownVisible}`);

    // Take screenshot after menu should be open
    await this.screenshot('after-menu-click', 'After clicking options menu');
  }

  /** Click the Realignment option in the component menu */
  async clickRealignmentOption(): Promise<void> {
    const realignmentButton = this.page.getByRole('button', { name: /Realignment/i });
    await realignmentButton.click();
    await this.page.waitForTimeout(500);
    console.log('Clicked Realignment option');
  }

  /** Wait for the realignment modal to open */
  async waitForRealignmentModal(): Promise<void> {
    await this.page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    const title = this.page.getByRole('heading', { name: /Realign Content/i });
    await title.waitFor({ state: 'visible', timeout: 5000 });
    console.log('Realignment modal is open');
  }

  /** Check if realignment modal is open */
  async isRealignmentModalOpen(): Promise<boolean> {
    const title = this.page.getByRole('heading', { name: /Realign Content/i });
    return title.isVisible();
  }

  /** Check if personas are available in the modal (tests Bug #1) */
  async hasPersonasInModal(): Promise<{ hasPersonas: boolean; hasAddButton: boolean; message: string }> {
    // Check for "Add Persona" button (indicates personas exist)
    const addPersonaBtn = this.page.getByText('Add Persona');
    const hasAddButton = await addPersonaBtn.isVisible().catch(() => false);

    // Check for "No personas available" message
    const noPersonasMsg = this.page.locator('text=No personas available');
    const hasNoPersonasMsg = await noPersonasMsg.isVisible().catch(() => false);

    if (hasAddButton) {
      return { hasPersonas: true, hasAddButton: true, message: 'Personas are available' };
    } else if (hasNoPersonasMsg) {
      return { hasPersonas: false, hasAddButton: false, message: 'No personas available (Bug #1)' };
    } else {
      return { hasPersonas: false, hasAddButton: false, message: 'Could not determine persona state' };
    }
  }

  /** Select a learning objective in the realignment modal */
  async selectFirstLearningObjective(): Promise<boolean> {
    // Learning objectives are rendered as buttons with checkbox styling
    const loButtons = this.page.locator('[role="dialog"] button').filter({
      has: this.page.locator('svg'), // Has checkbox icon
    });

    const count = await loButtons.count();
    console.log(`Found ${count} learning objective buttons`);

    if (count > 0) {
      // Find one that looks like a learning objective (starts with verb)
      for (let i = 0; i < count; i++) {
        const text = await loButtons.nth(i).textContent();
        if (text && text.match(/^(Identify|Describe|Explain|Express|Apply|Analyze|Evaluate|Create)/i)) {
          await loButtons.nth(i).click();
          console.log(`Selected learning objective: "${text.substring(0, 50)}..."`);
          return true;
        }
      }
    }

    return false;
  }

  /** Fill in the additional instructions textarea */
  async fillAdditionalInstructions(instructions: string): Promise<void> {
    const textarea = this.page.locator('[role="dialog"] textarea');
    await textarea.fill(instructions);
    console.log(`Filled additional instructions: "${instructions.substring(0, 50)}..."`);
  }

  /** Click the "Regenerate with Alignment" button */
  async clickRegenerateWithAlignment(): Promise<void> {
    const regenButton = this.page.getByRole('button', { name: /Regenerate with Alignment/i });
    await regenButton.click();
    console.log('Clicked Regenerate with Alignment');
  }

  /** Wait for regeneration to complete (polls for job completion) */
  async waitForRegenerationComplete(timeoutMs = 180000): Promise<{
    success: boolean;
    modalClosed: boolean;
    error?: string;
  }> {
    const startTime = Date.now();

    // First check if modal closed immediately (Bug #2 indicator)
    await this.page.waitForTimeout(2000);
    const modalStillOpen = await this.isRealignmentModalOpen();

    if (!modalStillOpen) {
      console.log('Modal closed immediately - potential Bug #2');
      // Modal closed, but we still need to wait for content to update
      // Poll for component content changes
    }

    // Wait for either:
    // 1. Modal shows loading state and then closes
    // 2. Content updates in the background

    while (Date.now() - startTime < timeoutMs) {
      // Check for error in modal
      const errorVisible = await this.page.locator('text=Failed to regenerate').isVisible().catch(() => false);
      if (errorVisible) {
        return { success: false, modalClosed: !modalStillOpen, error: 'Failed to regenerate' };
      }

      // Check if modal closed (success case when bug is fixed)
      const modalOpen = await this.isRealignmentModalOpen();
      if (!modalOpen && modalStillOpen) {
        // Modal was open, now closed - regeneration complete
        console.log('Modal closed - regeneration complete');
        return { success: true, modalClosed: true };
      }

      // Log progress
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed % 10 === 0 && elapsed > 0) {
        console.log(`Waiting for regeneration... ${elapsed}s elapsed`);
      }

      await this.page.waitForTimeout(3000);
    }

    return { success: false, modalClosed: !await this.isRealignmentModalOpen(), error: 'Timeout' };
  }

  /** Close the realignment modal (cancel) */
  async closeRealignmentModal(): Promise<void> {
    const cancelButton = this.page.getByRole('button', { name: /Cancel/i });
    if (await cancelButton.isVisible()) {
      await cancelButton.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.page.waitForTimeout(500);
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
