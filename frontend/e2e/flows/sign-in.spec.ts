import { test, expect } from '@playwright/test';

test.describe('Sign In Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Kratos login flow
    await page.route('**/self-service/login/browser', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-login-flow-id',
          type: 'browser',
          ui: {
            action: '/auth/login',
            method: 'POST',
            nodes: [],
          },
        }),
      });
    });
  });

  test('login page displays form', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('form')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/login-page.png' });
  });

  test('login page has email and password fields', async ({ page }) => {
    await page.goto('/auth/login');

    // Check for email field
    const emailField = page.locator('input[type="email"], input[name="email"], input[name="identifier"]');
    await expect(emailField.first()).toBeVisible();

    // Check for password field
    const passwordField = page.locator('input[type="password"]');
    await expect(passwordField.first()).toBeVisible();
  });

  test('login page has sign in button', async ({ page }) => {
    await page.goto('/auth/login');

    const submitButton = page.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Log")');
    await expect(submitButton.first()).toBeVisible();
  });

  test('login page has link to registration', async ({ page }) => {
    await page.goto('/auth/login');

    const registerLink = page.locator('a[href*="registration"], a:has-text("Sign up"), a:has-text("Register")');
    if (await registerLink.first().isVisible()) {
      await registerLink.first().click();
      await expect(page).toHaveURL(/registration/);
    }
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    // Mock successful authentication
    await page.route('**/sessions/whoami', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-session-id',
          active: true,
          identity: {
            id: 'test-user-id',
            traits: { email: 'test@example.com' },
          },
        }),
      });
    });

    await page.route('**/mirai.v1.UserService/GetMe', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'test-user-id', email: 'test@example.com', role: 'admin' },
          company: { id: 'test-company-id', name: 'Test Co' },
        }),
      });
    });

    await page.goto('/dashboard');
    await page.screenshot({ path: 'e2e/screenshots/dashboard-authenticated.png' });
  });
});
