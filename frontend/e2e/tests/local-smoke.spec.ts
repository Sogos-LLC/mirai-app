/**
 * Local Development Environment Smoke Tests
 *
 * Verifies the k3d local development cluster is working:
 * - Marketing site (get-mirai.dev)
 * - Frontend app (mirai.dev)
 * - API health (api.mirai.dev)
 * - Auth service (auth.mirai.dev)
 *
 * Run with: npx playwright test --config=playwright.local.config.ts --reporter=list
 */
import { test, expect } from '@playwright/test';

// Local dev URLs
const URLS = {
  marketing: 'https://get-mirai.dev',
  frontend: 'https://mirai.dev',
  api: 'https://api.mirai.dev',
  auth: 'https://auth.mirai.dev',
};

const SCREENSHOT_DIR = 'playwright/screenshots/local-smoke';

test.describe('Local Development Smoke Tests', () => {
  test.beforeAll(async () => {
    // Ensure screenshot directory exists
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), SCREENSHOT_DIR);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  test('Marketing site loads correctly', async ({ page }) => {
    // Navigate to marketing site
    const response = await page.goto(URLS.marketing, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Verify response
    expect(response?.status()).toBe(200);

    // Wait for page to be loaded (not networkidle - can timeout with analytics)
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000); // Brief wait for JS to execute

    // Check for key marketing elements
    const title = await page.title();
    console.log(`Marketing page title: ${title}`);

    // Take screenshot
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-marketing-homepage.png`,
      fullPage: true,
    });

    // Verify page has content
    const body = await page.locator('body');
    await expect(body).toBeVisible();

    // Check for "Mirai" branding somewhere on page
    const pageContent = await page.content();
    expect(pageContent.toLowerCase()).toContain('mirai');
  });

  test('Frontend app redirects unauthenticated users', async ({ page }) => {
    // Navigate to frontend - should redirect to marketing or login
    const response = await page.goto(URLS.frontend, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for page to load and any redirects
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000); // Wait for redirects

    // Get final URL after redirects
    const finalUrl = page.url();
    console.log(`Frontend redirected to: ${finalUrl}`);

    // Take screenshot of where we ended up
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/02-frontend-redirect.png`,
      fullPage: true,
    });

    // Should redirect to marketing or login page
    const isMarketing = finalUrl.includes('get-mirai.dev');
    const isLogin = finalUrl.includes('/auth/login') || finalUrl.includes('auth.mirai.dev');
    expect(isMarketing || isLogin).toBe(true);
  });

  test('API health endpoint returns OK', async ({ request }) => {
    // Call health endpoint directly
    const response = await request.get(`${URLS.api}/health`, {
      ignoreHTTPSErrors: true,
    });

    // Verify response
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toBe('ok');

    console.log(`API health check: ${body}`);
  });

  test('Auth service (Kratos) is accessible', async ({ page }) => {
    // Navigate to Kratos public endpoint
    const response = await page.goto(`${URLS.auth}/.well-known/ory/webauthn.js`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Kratos should return a response (even if 404 for this specific path)
    // The key is that the service is reachable
    console.log(`Auth service status: ${response?.status()}`);

    // Try the health endpoint if available
    const healthResponse = await page.request.get(`${URLS.auth}/health/ready`, {
      ignoreHTTPSErrors: true,
    });
    console.log(`Auth health status: ${healthResponse.status()}`);

    // Take screenshot
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/03-auth-service.png`,
    });
  });

  test('Login page renders correctly', async ({ page }) => {
    // Navigate directly to login
    await page.goto(`${URLS.frontend}/auth/login`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    console.log(`Login page URL: ${finalUrl}`);

    // Take screenshot
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/04-login-page.png`,
      fullPage: true,
    });

    // Should have login form elements (check for common patterns)
    const pageContent = await page.content();
    const hasEmailField = pageContent.toLowerCase().includes('email') ||
                          pageContent.toLowerCase().includes('identifier');
    const hasPasswordField = pageContent.toLowerCase().includes('password');
    const hasSignIn = pageContent.toLowerCase().includes('sign in') ||
                      pageContent.toLowerCase().includes('login') ||
                      pageContent.toLowerCase().includes('log in');

    console.log(`Has email: ${hasEmailField}, password: ${hasPasswordField}, sign in: ${hasSignIn}`);

    // Verify the page loaded something auth-related
    expect(hasEmailField || hasPasswordField || hasSignIn).toBe(true);
  });

  test('Registration page renders correctly', async ({ page }) => {
    // Navigate to registration
    await page.goto(`${URLS.frontend}/auth/registration`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    console.log(`Registration page URL: ${finalUrl}`);

    // Take screenshot
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/05-register-page.png`,
      fullPage: true,
    });

    // Should have registration form elements
    const pageContent = await page.content();
    const hasEmailField = pageContent.toLowerCase().includes('email');
    const hasPasswordField = pageContent.toLowerCase().includes('password');
    const hasSignUp = pageContent.toLowerCase().includes('sign up') ||
                      pageContent.toLowerCase().includes('register') ||
                      pageContent.toLowerCase().includes('create');
    const hasNameField = pageContent.toLowerCase().includes('name') ||
                         pageContent.toLowerCase().includes('first');

    console.log(`Has email: ${hasEmailField}, password: ${hasPasswordField}, signup: ${hasSignUp}, name: ${hasNameField}`);

    // Verify form structure exists
    expect(hasEmailField || hasPasswordField || hasSignUp || hasNameField).toBe(true);
  });

  test('Console has no critical errors', async ({ page }) => {
    const errors: string[] = [];

    // Collect console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Visit marketing site and check for errors
    await page.goto(URLS.marketing, { waitUntil: 'load' });
    await page.waitForTimeout(2000);

    // Filter out expected/non-critical errors
    const criticalErrors = errors.filter((err) => {
      // Ignore common non-critical errors
      if (err.includes('favicon')) return false;
      if (err.includes('404')) return false;
      if (err.includes('Failed to load resource')) return false;
      return true;
    });

    if (criticalErrors.length > 0) {
      console.log('Console errors found:', criticalErrors);
    }

    // No critical JS errors
    expect(criticalErrors.length).toBe(0);
  });
});
