import { test as base, expect, Page } from '@playwright/test';

/**
 * Extended test fixture that adds console and network logging.
 * Auth state is pre-loaded from global setup - no per-test login needed.
 */
export const test = base.extend<{
  loggedPage: Page;
}>({
  loggedPage: async ({ page }, use) => {
    const browserLogs: string[] = [];
    const networkLogs: string[] = [];

    // Capture ALL browser console output
    page.on('console', (msg) => {
      const logEntry = `[${msg.type().toUpperCase()}] ${msg.text()}`;
      browserLogs.push(logEntry);
      // Also log to stdout for real-time visibility
      console.log(logEntry);
    });

    // Capture page errors (unhandled exceptions)
    page.on('pageerror', (error) => {
      const errorEntry = `[PAGE_ERROR] ${error.message}`;
      browserLogs.push(errorEntry);
      console.error(errorEntry);
      if (error.stack) {
        console.error(error.stack);
      }
    });

    // Capture network requests
    page.on('request', (request) => {
      const entry = `[REQ] ${request.method()} ${request.url()}`;
      networkLogs.push(entry);
    });

    // Capture network responses, especially API errors
    page.on('response', async (response) => {
      const entry = `[RES] ${response.status()} ${response.url()}`;
      networkLogs.push(entry);

      // Log API errors in detail
      if (response.url().includes('AIGenerationService') || response.url().includes('/api/')) {
        if (response.status() >= 400) {
          try {
            const body = await response.text();
            const errorEntry = `[API_ERROR] ${response.status()} ${response.url()}\n${body}`;
            browserLogs.push(errorEntry);
            console.error(errorEntry);
          } catch {
            // Response body might not be readable
          }
        }
      }
    });

    // Capture request failures
    page.on('requestfailed', (request) => {
      const failure = request.failure();
      const entry = `[REQ_FAILED] ${request.method()} ${request.url()} - ${failure?.errorText || 'unknown error'}`;
      networkLogs.push(entry);
      console.error(entry);
    });

    // Run the test
    await use(page);

    // Output summary after test
    console.log('\n========== BROWSER CONSOLE LOGS ==========');
    browserLogs.forEach((log) => console.log(log));
    console.log('========== END BROWSER LOGS ==========\n');

    console.log('\n========== NETWORK REQUESTS ==========');
    // Only show last 50 network logs to avoid overwhelming output
    const recentNetwork = networkLogs.slice(-50);
    recentNetwork.forEach((log) => console.log(log));
    if (networkLogs.length > 50) {
      console.log(`... and ${networkLogs.length - 50} more requests`);
    }
    console.log('========== END NETWORK REQUESTS ==========\n');
  },
});

export { expect };

/**
 * Helper to take a screenshot with consistent naming.
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  description?: string
) {
  const path = `playwright/screenshots/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`Screenshot: ${name}.png${description ? ` - ${description}` : ''}`);
  return path;
}
