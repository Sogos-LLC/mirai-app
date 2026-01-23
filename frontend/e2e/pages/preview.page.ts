import { expect, type Page } from '@playwright/test';
import { takeScreenshot } from '../helpers';
import { TIMEOUTS } from '../config';

/**
 * Page object for Course Preview - validates lesson content quality
 */
export class PreviewPage {
  private screenshotCounter = 0;

  constructor(private page: Page) {}

  async goto(courseId: string): Promise<void> {
    await this.page.goto(`/course/${courseId}/preview`, {
      waitUntil: 'domcontentloaded',
    });
    await this.page.waitForTimeout(2000);
  }

  async getLessonCount(): Promise<number> {
    const progressText = await this.page.locator('text=/\\d+ \\/ \\d+ lessons/').textContent();
    if (!progressText) return 0;
    const match = progressText.match(/(\d+) \/ (\d+) lessons/);
    return match ? parseInt(match[2], 10) : 0;
  }

  async selectLesson(index: number): Promise<void> {
    // Find all lesson items in the sidebar (they have checkmark or circle icons)
    const lessons = this.page.locator('aside button, aside [role="button"]').filter({
      has: this.page.locator('svg'),
    });
    await lessons.nth(index).click();
    await this.page.waitForTimeout(1500);
  }

  async getLessonTitle(): Promise<string> {
    // Get the large heading in the main content area (not "Course Preview" header)
    const contentArea = this.page.locator('main').first();
    const title = await contentArea.locator('h1, h2').first().textContent();
    return title?.trim() || 'Unknown';
  }

  async countComponents(): Promise<Record<string, number>> {
    // Focus only on the scrollable content area, not sidebar
    const content = this.page.locator('main > div').last();

    const counts: Record<string, number> = {
      heading: 0,
      text: 0,
      image: 0,
      quiz: 0,
      callout: 0,
      list: 0,
      other: 0,
    };

    // Count image placeholders (these have "IMAGE PLACEHOLDER" label)
    counts.image = await content.locator('text=IMAGE PLACEHOLDER').count();

    // Count quizzes (Knowledge Check sections with purple header)
    counts.quiz = await content.locator('text=Knowledge Check').count();

    // Count callouts (have border-l-4 styling - yellow/blue/green boxes)
    counts.callout = await content.locator('[class*="border-l-"]').count();

    // Count text content - look for prose class or substantial paragraphs
    // Exclude image descriptions and quiz text
    const proseBlocks = await content.locator('.prose').count();
    const textBlocks = await content.locator('p').filter({
      hasNot: this.page.locator('text=IMAGE PLACEHOLDER'),
    }).count();
    counts.text = Math.max(proseBlocks, textBlocks - counts.image - counts.quiz);

    // Count headings - but subtract 1 for the lesson title
    const headings = await content.locator('h1, h2, h3, h4').count();
    counts.heading = Math.max(0, headings - 1); // -1 for lesson title

    // Count lists
    counts.list = await content.locator('ul, ol').count();

    return counts;
  }

  async hasConsecutiveImages(maxAllowed: number): Promise<boolean> {
    const imagePlaceholders = this.page.locator('text=IMAGE PLACEHOLDER');
    const count = await imagePlaceholders.count();
    if (count < maxAllowed) return false;

    // Check if images are stacked by comparing their vertical positions
    const boxes = await imagePlaceholders.all();
    let consecutive = 1;
    for (let i = 1; i < boxes.length; i++) {
      const prev = await boxes[i - 1].boundingBox();
      const curr = await boxes[i].boundingBox();
      if (prev && curr && Math.abs(curr.y - (prev.y + prev.height)) < 100) {
        consecutive++;
        if (consecutive >= maxAllowed) return true;
      } else {
        consecutive = 1;
      }
    }
    return false;
  }

  async screenshot(name: string, description: string): Promise<void> {
    this.screenshotCounter++;
    const prefix = `quality-${String(this.screenshotCounter).padStart(2, '0')}`;
    await takeScreenshot(this.page, `${prefix}-${name}`, description);
  }
}
