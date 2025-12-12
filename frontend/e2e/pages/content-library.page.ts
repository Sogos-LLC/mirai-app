import { Page, expect } from '@playwright/test';
import { takeScreenshot } from '../helpers';

/**
 * Page Object for the Content Library page.
 * Handles navigation to courses and folder management.
 */
export class ContentLibraryPage {
  constructor(private page: Page) {}

  /** Navigate to the content library */
  async goto(): Promise<void> {
    await this.page.goto('/content-library', { waitUntil: 'domcontentloaded' });
    await expect(
      this.page.getByRole('heading', { name: 'Content Library' })
    ).toBeVisible({ timeout: 15000 });
  }

  /** Click on a folder (Shared or Private) */
  async selectFolder(folderName: 'Shared' | 'Private'): Promise<void> {
    await this.page.getByText(folderName).first().click();
    await this.page.waitForTimeout(1000);
  }

  /** Get all course cards on the current page */
  async getCourseCards() {
    // Course cards have "Edit" buttons - look for those
    return this.page.locator('button, a').filter({ hasText: 'Edit' });
  }

  /** Get all course links on the current page */
  async getCourseLinks() {
    // Try multiple selectors for course links/cards
    const links = this.page.locator('a[href*="/course/"]');
    const count = await links.count();
    if (count > 0) return links;

    // Fallback: look for Edit buttons (course cards)
    return this.getCourseCards();
  }

  /** Get count of courses in current view */
  async getCourseCount(): Promise<number> {
    const cards = await this.getCourseCards();
    return cards.count();
  }

  /** Click on the first course and navigate to it */
  async openFirstCourse(): Promise<string | null> {
    // Try direct links first
    const links = this.page.locator('a[href*="/course/"]');
    if ((await links.count()) > 0) {
      const href = await links.first().getAttribute('href');
      await links.first().click();
      await this.page.waitForURL(/\/course\//, { timeout: 15000 });
      return href;
    }

    // Fallback: click Edit button on first course card
    const editButtons = await this.getCourseCards();
    const count = await editButtons.count();

    if (count === 0) {
      return null;
    }

    await editButtons.first().click();
    await this.page.waitForURL(/\/course\//, { timeout: 15000 });
    return this.page.url();
  }

  /** Click on a specific course by partial title match */
  async openCourseByTitle(titlePattern: string): Promise<boolean> {
    const courseLink = this.page.locator('a[href*="/course/"]').filter({
      hasText: titlePattern,
    });

    if ((await courseLink.count()) === 0) {
      return false;
    }

    await courseLink.first().click();
    await this.page.waitForURL(/\/course\//, { timeout: 15000 });
    return true;
  }

  /** Poll for courses to appear (useful after wizard creates a course) */
  async waitForCourses(options?: {
    maxAttempts?: number;
    delayMs?: number;
    screenshotPrefix?: string;
  }): Promise<boolean> {
    const { maxAttempts = 30, delayMs = 6000, screenshotPrefix = 'poll' } = options || {};

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.selectFolder('Private');
      const count = await this.getCourseCount();

      if (count > 0) {
        console.log(`Found ${count} course(s) after ${(attempt + 1) * (delayMs / 1000)}s`);
        return true;
      }

      console.log(`Attempt ${attempt + 1}/${maxAttempts}: No courses yet, waiting ${delayMs / 1000}s...`);
      await this.page.waitForTimeout(delayMs);
      await this.page.reload();
    }

    await takeScreenshot(this.page, `${screenshotPrefix}-no-courses-found`, 'No courses after polling');
    return false;
  }

  /** Take a screenshot of the current state */
  async screenshot(name: string, description?: string): Promise<void> {
    await takeScreenshot(this.page, name, description);
  }
}
