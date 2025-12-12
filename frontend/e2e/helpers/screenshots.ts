import { Page } from '@playwright/test';
import * as path from 'path';

const SCREENSHOTS_DIR = 'playwright/screenshots';

/**
 * Takes a screenshot with consistent naming and logging.
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  description?: string
): Promise<string> {
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot: ${name}.png${description ? ` - ${description}` : ''}`);
  return screenshotPath;
}

/**
 * Takes a screenshot on error with 'error-' prefix.
 */
export async function takeErrorScreenshot(
  page: Page,
  testName: string,
  error: Error
): Promise<string> {
  const name = `error-${testName}-${Date.now()}`;
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${name}.png`);

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`Error screenshot saved: ${name}.png`);
    console.error(`Error: ${error.message}`);
  } catch {
    console.error('Failed to take error screenshot');
  }

  return screenshotPath;
}
