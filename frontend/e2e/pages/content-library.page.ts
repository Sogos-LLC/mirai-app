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

  /** Get all course links on the current page */
  async getCourseLinks() {
    return this.page.locator('a[href*="/course/"]');
  }

  /** Get count of courses in current view */
  async getCourseCount(): Promise<number> {
    const links = await this.getCourseLinks();
    return links.count();
  }

  /** Click on the first course and navigate to it */
  async openFirstCourse(): Promise<string | null> {
    const links = await this.getCourseLinks();
    const count = await links.count();

    if (count === 0) {
      return null;
    }

    const href = await links.first().getAttribute('href');
    await links.first().click();
    await this.page.waitForURL(/\/course\//, { timeout: 15000 });

    return href;
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
