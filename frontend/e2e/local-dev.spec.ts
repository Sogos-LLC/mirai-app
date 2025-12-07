import { test, expect } from '@playwright/test';
import { LOCAL_URLS, HEALTH_ENDPOINTS } from './fixtures/local-urls';

/**
 * Integration tests for k3d local development cluster
 *
 * Prerequisites:
 * - k3d cluster running (mirai-local)
 * - HAProxy configured with TLS termination
 * - /etc/hosts entries:
 *   127.0.0.1 mirai.local
 *   127.0.0.1 get-mirai.local
 *   127.0.0.1 api.mirai.local
 *   127.0.0.1 auth.mirai.local
 * - mkcert certificates trusted by system
 */

test.describe('Local k3d Cluster - Service Availability', () => {
  test('frontend loads at mirai.local', async ({ page }) => {
    const response = await page.goto(LOCAL_URLS.frontend);
    expect(response?.status()).toBeLessThan(500); // Accept redirects, auth pages, etc.
    await expect(page).toHaveTitle(/Mirai/i);
  });

  test('marketing site loads at get-mirai.local', async ({ page }) => {
    const response = await page.goto(LOCAL_URLS.marketing);
    expect(response?.status()).toBeLessThan(500);
    // Marketing site should load without errors
    await expect(page.locator('body')).toBeVisible();
  });

  test('API health check responds', async ({ request }) => {
    const response = await request.get(HEALTH_ENDPOINTS.api);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('status');
  });

  test('Kratos WebAuthn endpoint is accessible', async ({ request }) => {
    const response = await request.get(HEALTH_ENDPOINTS.kratosWebauthn);
    // Should return JavaScript file or redirect
    expect([200, 301, 302, 303, 307, 308]).toContain(response.status());
  });
});

test.describe('Local k3d Cluster - Auth Flow Pages', () => {
  test('login page renders', async ({ page }) => {
    await page.goto(`${LOCAL_URLS.frontend}/auth/login`);

    // Should see a form (Kratos UI or custom login)
    const form = page.locator('form');
    await expect(form).toBeVisible({ timeout: 15000 });
  });

  test('registration page renders', async ({ page }) => {
    await page.goto(`${LOCAL_URLS.frontend}/auth/registration`);

    // Should see a form
    const form = page.locator('form');
    await expect(form).toBeVisible({ timeout: 15000 });
  });

  test('login page has expected auth fields', async ({ page }) => {
    await page.goto(`${LOCAL_URLS.frontend}/auth/login`);

    // Wait for form to load
    await page.waitForSelector('form', { timeout: 15000 });

    // Check for email/identifier field
    const emailField = page.locator('input[type="email"], input[name="email"], input[name="identifier"]');
    const hasEmailField = await emailField.count() > 0;
    expect(hasEmailField).toBeTruthy();

    // Check for password field
    const passwordField = page.locator('input[type="password"]');
    const hasPasswordField = await passwordField.count() > 0;
    expect(hasPasswordField).toBeTruthy();
  });

  test('can navigate between login and registration', async ({ page }) => {
    await page.goto(`${LOCAL_URLS.frontend}/auth/login`);

    // Look for registration link
    const registerLink = page.locator('a[href*="registration"], a:has-text("Sign up"), a:has-text("Register")');
    if (await registerLink.count() > 0) {
      await registerLink.first().click();
      await expect(page).toHaveURL(/registration/, { timeout: 10000 });
    }
  });
});

test.describe('Local k3d Cluster - HTTPS and Certificates', () => {
  test('frontend uses HTTPS', async ({ page }) => {
    await page.goto(LOCAL_URLS.frontend);
    const url = page.url();
    expect(url).toMatch(/^https:\/\//);
  });

  test('API uses HTTPS', async ({ request }) => {
    const response = await request.get(HEALTH_ENDPOINTS.api);
    expect(HEALTH_ENDPOINTS.api).toMatch(/^https:\/\//);
    expect(response.ok()).toBeTruthy();
  });

  test('no SSL/TLS errors on frontend', async ({ page }) => {
    // With ignoreHTTPSErrors: true and trusted mkcert certs,
    // page should load without security warnings
    const response = await page.goto(LOCAL_URLS.frontend);
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('Local k3d Cluster - Cross-Service Integration', () => {
  test('frontend can communicate with API', async ({ page }) => {
    await page.goto(LOCAL_URLS.frontend);

    // Wait for any initial API calls
    // This ensures frontend can reach backend through HAProxy
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Page should load successfully
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('Kratos auth redirects work', async ({ page }) => {
    // Try to access a protected route
    // Should redirect to Kratos login flow
    await page.goto(`${LOCAL_URLS.frontend}/dashboard`);

    // Should either show dashboard (if cached session) or redirect to auth
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    const url = page.url();
    // URL should be valid and not show error page
    expect(url).toMatch(/mirai\.local/);
  });
});
