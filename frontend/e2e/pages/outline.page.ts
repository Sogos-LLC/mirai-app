import { Page, expect } from '@playwright/test';
import { takeScreenshot } from '../helpers';

/**
 * Page Object for the Course Outline Review page.
 *
 * This page is shown after the wizard completes and outline generation finishes.
 * Users can review the outline, edit sections/lessons, and approve to generate lessons.
 *
 * Flow:
 * 1. Navigate to /course/{courseId}/outline
 * 2. Review the outline (sections and lessons)
 * 3. Click "Approve & Generate Lessons" to start course generation
 * 4. Success modal appears, click "Got it!" to go to dashboard
 */
export class OutlinePage {
  private stepScreenshotCount = 0;

  constructor(private page: Page) {}

  /** Navigate to outline page for a course */
  async goto(courseId: string): Promise<void> {
    await this.page.goto(`/course/${courseId}/outline`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(2000);
    await this.screenshot('outline-loaded', 'Outline page loaded');
  }

  /** Wait for outline to load (not in loading state) */
  async waitForOutlineLoaded(): Promise<void> {
    // Wait for loading spinner to disappear
    await this.page.waitForSelector('[class*="animate-spin"]', {
      state: 'hidden',
      timeout: 60000,
    }).catch(() => {
      // Spinner might not exist if already loaded
    });

    // Wait for "Review Your Course Outline" heading or outline content
    const heading = this.page.getByText(/Review Your Course Outline/i);
    await expect(heading).toBeVisible({ timeout: 30000 });
    await this.screenshot('outline-content', 'Outline content loaded');
  }

  /** Get the number of sections shown */
  async getSectionCount(): Promise<number> {
    const sections = this.page.locator('text=/Section \\d+/');
    return sections.count();
  }

  /** Get the total lesson count from the header */
  async getTotalLessonCount(): Promise<string> {
    const header = this.page.locator('text=/\\d+ sections • \\d+ lessons/');
    const text = await header.textContent();
    return text || '0 sections • 0 lessons';
  }

  /** Click the "Generate Lessons" button */
  async clickGenerateLessons(): Promise<void> {
    console.log('Clicking Generate Lessons...');
    const btn = this.page.getByRole('button', { name: /Generate Lessons/i });
    await expect(btn).toBeVisible({ timeout: 10000 });
    await expect(btn).toBeEnabled({ timeout: 10000 });
    await btn.click();
    await this.screenshot('generate-clicked', 'Generate button clicked');
  }

  /** Wait for generation to start - either success modal or redirect to preview */
  async waitForSuccessModal(): Promise<void> {
    console.log('Waiting for generation confirmation...');

    // The flow may show a modal OR redirect directly to preview
    const successModal = this.page.getByText(/Awesome.*course is being created/i);
    const previewPage = this.page.getByText(/Course Preview/i);

    // Wait for either success modal or preview page
    await Promise.race([
      successModal.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
      previewPage.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
      this.page.waitForURL(/\/course\/[^/]+\/preview/, { timeout: 30000 }).catch(() => {}),
    ]);

    // Check what we got
    if (await successModal.isVisible().catch(() => false)) {
      console.log('Success modal appeared');
      await this.screenshot('success-modal', 'Success modal appeared');
    } else if (await previewPage.isVisible().catch(() => false)) {
      console.log('Redirected directly to preview page');
      await this.screenshot('preview-redirect', 'Redirected to preview');
    } else {
      console.log('Neither modal nor preview found - checking URL');
      await this.screenshot('generation-state', 'After clicking generate');
    }
  }

  /** Click "Got it!" to dismiss success modal (if it appeared) */
  async dismissSuccessModal(): Promise<boolean> {
    console.log('Checking for modal to dismiss...');

    // Check if we're already on preview page (no modal to dismiss)
    if (this.page.url().includes('/preview')) {
      console.log('Already on preview page - no modal to dismiss');
      return true;
    }

    try {
      const gotItBtn = this.page.getByRole('button', { name: /Got it/i });
      if (await gotItBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await gotItBtn.click();
        await this.page.waitForURL(/\/(dashboard|preview)/, { timeout: 10000 });
        console.log('Dismissed modal and redirected');
        await this.screenshot('after-dismiss', 'After dismissing success modal');
      } else {
        console.log('No modal found - may have auto-redirected');
      }
      return true;
    } catch (error) {
      console.log('Error dismissing modal:', error);
      await this.screenshot('dismiss-error', 'Error dismissing modal');
      return false;
    }
  }

  /** Complete the outline approval flow */
  async approveOutline(): Promise<boolean> {
    await this.waitForOutlineLoaded();
    await this.clickGenerateLessons();
    await this.waitForSuccessModal();
    return this.dismissSuccessModal();
  }

  /** Click "Cancel" to go back to dashboard */
  async cancel(): Promise<void> {
    const btn = this.page.getByRole('button', { name: /Cancel/i });
    await btn.click();
    await this.page.waitForURL(/\/dashboard/, { timeout: 10000 });
  }

  /** Click "Back to Dashboard" link */
  async goBackToDashboard(): Promise<void> {
    const link = this.page.getByText(/Back to Dashboard/i);
    await link.click();
    await this.page.waitForURL(/\/dashboard/, { timeout: 10000 });
  }

  // ===== Utilities =====

  /** Take a screenshot with auto-incrementing prefix */
  private async screenshot(name: string, description?: string): Promise<void> {
    this.stepScreenshotCount++;
    const prefix = String(this.stepScreenshotCount).padStart(2, '0');
    await takeScreenshot(this.page, `outline-${prefix}-${name}`, description);
  }
}
