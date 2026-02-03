/**
 * Shared test utilities for Playwright E2E tests
 */

import { Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

export const SCREENSHOT_BASE_DIR = 'playwright/screenshots';
export const TEST_FILES_DIR = path.join(
  process.cwd(),
  '../experiments/team-knowledge-poc/test-files'
);

export const ACME_HANDBOOK_PATH = path.join(TEST_FILES_DIR, 'acme-corp-product-handbook.md');

// Test data
export const TEST_TEAM = {
  name: 'E2E Test Team',
  description: 'Team created by E2E tests for knowledge-grounded course testing',
};

export const TEST_COURSE = {
  name: 'ACME Product Mastery for Sales Teams',
  context: 'This course will train our sales team on ACME products.',
};

// ─────────────────────────────────────────────────────────────────────────────
// SCREENSHOT UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export function ensureScreenshotDir(subdir: string): string {
  const dir = path.join(process.cwd(), SCREENSHOT_BASE_DIR, subdir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export async function screenshot(
  page: Page,
  dir: string,
  name: string,
  description?: string
): Promise<string> {
  const screenshotDir = ensureScreenshotDir(dir);
  const filename = `${name}.png`;
  const filepath = path.join(screenshotDir, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  if (description) {
    console.log(`  📸 ${filename}: ${description}`);
  }
  return filepath;
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function navigateTo(page: Page, path: string, waitTime = 2000): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(waitTime);
}

export async function waitForElement(
  page: Page,
  selector: string,
  timeout = 10000
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function getTeamCount(page: Page): Promise<number> {
  const teamCards = page.locator('a[href*="/teams/"]');
  return teamCards.count();
}

export async function createTeam(page: Page, teamName: string): Promise<boolean> {
  const createBtn = page.getByRole('button', { name: /create team/i });
  if (!(await createBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    return false;
  }

  await createBtn.click();
  await page.waitForTimeout(500);

  const nameInput = page.locator('input#name, input[placeholder*="name"]');
  if (!(await nameInput.isVisible({ timeout: 3000 }).catch(() => false))) {
    return false;
  }

  await nameInput.fill(teamName);

  const submitBtn = page.locator('button[type="submit"]');
  await submitBtn.click();
  await page.waitForTimeout(2000);

  return true;
}

export async function navigateToFirstTeam(page: Page): Promise<string | null> {
  const teamCards = page.locator('a[href*="/teams/"]');
  const count = await teamCards.count();

  if (count === 0) return null;

  const href = await teamCards.first().getAttribute('href');
  await teamCards.first().click();
  await page.waitForTimeout(2000);

  return href;
}

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE UPLOAD HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadKnowledgeFile(
  page: Page,
  filePath: string
): Promise<boolean> {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️ File not found: ${filePath}`);
    return false;
  }

  const fileInput = page.locator('input[type="file"]');
  if ((await fileInput.count()) === 0) {
    console.log('  ⚠️ No file input found');
    return false;
  }

  await fileInput.first().setInputFiles(filePath);
  return true;
}

export async function waitForKnowledgeProcessing(
  page: Page,
  maxWaitSeconds = 30
): Promise<'ready' | 'processing' | 'error' | 'timeout'> {
  for (let i = 0; i < maxWaitSeconds / 2; i++) {
    await page.waitForTimeout(2000);

    const readyBadge = page.locator('text=/ready/i');
    const processingBadge = page.locator('text=/processing/i');
    const errorBadge = page.locator('text=/error|failed/i');

    if (await readyBadge.isVisible().catch(() => false)) {
      return 'ready';
    }
    if (await errorBadge.isVisible().catch(() => false)) {
      return 'error';
    }
    if (await processingBadge.isVisible().catch(() => false)) {
      console.log('  ⏳ Processing...');
    }
  }
  return 'timeout';
}

// ─────────────────────────────────────────────────────────────────────────────
// WIZARD HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function getWizardStepCount(page: Page): Promise<number | null> {
  const stepIndicator = page.locator('text=/\\d+ simple steps/i');
  const text = await stepIndicator.textContent().catch(() => '');
  const match = text?.match(/(\d+) simple steps/i);
  return match ? parseInt(match[1], 10) : null;
}

export async function isOnKnowledgeSelectionStep(page: Page): Promise<boolean> {
  const knowledgeUI = page.locator('text=/select.*knowledge|knowledge sources/i');
  return knowledgeUI.isVisible({ timeout: 3000 }).catch(() => false);
}

export async function clickWizardNext(page: Page): Promise<boolean> {
  const nextBtn = page.getByRole('button', { name: /continue|next|generate/i });
  if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Check if enabled
    const isDisabled = await nextBtn.isDisabled();
    if (!isDisabled) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
      return true;
    }
  }
  return false;
}

export async function waitForGeneration(page: Page, maxWaitSeconds = 120): Promise<boolean> {
  for (let i = 0; i < maxWaitSeconds / 3; i++) {
    await page.waitForTimeout(3000);

    // Check if we're still on a generating step
    const loadingIndicator = page.locator('text=/generating|loading|processing/i');
    if (!(await loadingIndicator.isVisible().catch(() => false))) {
      return true;
    }
  }
  return false;
}
