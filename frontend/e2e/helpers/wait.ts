import { Page, expect } from '@playwright/test';

export interface PollOptions {
  /** Maximum number of attempts */
  maxAttempts?: number;
  /** Delay between attempts in ms */
  delayMs?: number;
  /** Optional callback after each failed attempt */
  onAttempt?: (attempt: number) => void;
}

/**
 * Polls until a condition is met or max attempts reached.
 */
export async function pollUntil<T>(
  condition: () => Promise<T | null>,
  options: PollOptions = {}
): Promise<T | null> {
  const { maxAttempts = 30, delayMs = 6000, onAttempt } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await condition();
    if (result !== null) {
      return result;
    }

    onAttempt?.(attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return null;
}

/**
 * Waits for navigation to complete with domcontentloaded.
 * Use this instead of networkidle which doesn't work with SSE streams.
 */
export async function waitForNavigation(page: Page, url: string | RegExp): Promise<void> {
  if (typeof url === 'string') {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  } else {
    await page.waitForURL(url, { timeout: 30000 });
  }
}

/**
 * Waits for an element to be visible with a custom timeout.
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeoutMs = 15000
): Promise<void> {
  await expect(page.locator(selector)).toBeVisible({ timeout: timeoutMs });
}

/**
 * Waits for AI generation to complete (approx 20 seconds).
 * AI steps in the wizard take ~7-20 seconds.
 */
export async function waitForAIGeneration(page: Page, description: string): Promise<void> {
  console.log(`Waiting for AI: ${description} (~20s)...`);
  await page.waitForTimeout(25000);
}

/**
 * Waits for a button to be enabled and visible.
 */
export async function waitForEnabledButton(
  page: Page,
  namePattern: RegExp,
  timeoutMs = 30000
): Promise<boolean> {
  const button = page.getByRole('button', { name: namePattern });

  try {
    await button.waitFor({ state: 'visible', timeout: timeoutMs });
    // Check if enabled
    const isDisabled = await button.isDisabled();
    return !isDisabled;
  } catch {
    return false;
  }
}
