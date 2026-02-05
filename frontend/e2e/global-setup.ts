/**
 * Playwright Global Setup — Programmatic Ory Kratos Login
 *
 * Logs in via the browser login flow and saves session cookies
 * to e2e/.auth/user.json for all tests to reuse.
 *
 * Required env vars:
 *   E2E_USER_EMAIL    - Test user email
 *   E2E_USER_PASSWORD - Test user password
 */
import { chromium, type FullConfig } from '@playwright/test';
import { BASE_URL, AUTH } from './config';

export default async function globalSetup(_config: FullConfig) {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    console.log('E2E_USER_EMAIL and E2E_USER_PASSWORD not set — skipping auth setup');
    console.log('Tests will use existing auth state from', AUTH.stateFile);
    return;
  }

  console.log(`\n--- Global Setup: Logging in as ${email} ---`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    // Navigate to login page
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'domcontentloaded' });

    // Wait for Kratos form to render (identifier field appears)
    await page.locator('#identifier').waitFor({ state: 'visible', timeout: 15000 });

    // Fill login form
    await page.locator('#identifier').fill(email);
    await page.locator('#password').fill(password);

    // Submit the form
    await page.locator('button[type="submit"]').click();

    // Wait for redirect to authenticated area (dashboard or content library)
    await page.waitForURL(/\/(dashboard|content-library|course)/, { timeout: 15000 });

    console.log(`Logged in successfully — redirected to ${page.url()}`);

    // Save storage state (cookies + localStorage)
    await context.storageState({ path: AUTH.stateFile });
    console.log(`Auth state saved to ${AUTH.stateFile}\n`);
  } catch (err) {
    console.error('Login failed:', err);
    // Take a screenshot for debugging
    await page.screenshot({ path: 'playwright/screenshots/login-failed.png' });
    throw err;
  } finally {
    await browser.close();
  }
}
