import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

const TOPICS = [
  'MySQL',
  'Grilling Food Outdoors',
  'Scuba Diving',
  'Buying Your First Home',
  'Desktop Computer Hardware',
  'Speaking Spanish',
  'Indoor Gardening',
  'Fishing for Beginners',
  'Basic Photography',
  'Home Brewing Coffee',
];

export function randomTopic(): string {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}

export function courseTitle(topic: string): string {
  return `Getting Started with ${topic}`;
}

let screenshotCounter = 0;

export async function screenshot(page: Page, name: string): Promise<string> {
  screenshotCounter++;
  const filename = `${String(screenshotCounter).padStart(2, '0')}-${name}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

export function resetScreenshotCounter(): void {
  screenshotCounter = 0;
}
