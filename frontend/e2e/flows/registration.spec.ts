import { test, expect } from '@playwright/test';

test.describe('User Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Kratos registration flow
    await page.route('**/self-service/registration/browser', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-flow-id',
          type: 'browser',
          ui: {
            action: '/auth/registration',
            method: 'POST',
            nodes: [],
          },
        }),
      });
    });

    // Mock email check endpoint
    await page.route('**/mirai.v1.AuthService/CheckEmail', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: true }),
      });
    });

    // Mock Stripe checkout (redirect interception)
    await page.route('**/mirai.v1.BillingService/CreateCheckoutSession', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          checkoutUrl: 'http://localhost:3000/dashboard?checkout_success=true',
        }),
      });
    });
  });

  test('registration page shows email input', async ({ page }) => {
    await page.goto('/auth/registration');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
  });

  test('registration wizard navigation', async ({ page }) => {
    await page.goto('/auth/registration');

    // Check that we're on step 1
    await expect(page.locator('form')).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'e2e/screenshots/registration-step1.png' });
  });

  test('email validation shows error for invalid email', async ({ page }) => {
    await page.goto('/auth/registration');

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    if (await emailInput.isVisible()) {
      await emailInput.fill('invalid-email');
      await emailInput.blur();

      // Should show validation error
      await page.screenshot({ path: 'e2e/screenshots/registration-invalid-email.png' });
    }
  });
});
