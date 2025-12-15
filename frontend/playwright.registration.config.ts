import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for UAT registration tests.
 *
 * These tests verify the complete registration flow including:
 * - Multi-step wizard (Email, Org, Account, Plan)
 * - Stripe checkout integration
 * - Post-payment redirect
 *
 * Usage:
 *   npx playwright test --config=playwright.registration.config.ts
 */
export default defineConfig({
  // Only run registration tests
  testDir: './e2e/tests',
  testMatch: 'uat-registration.spec.ts',

  // Run tests sequentially (registration flow is stateful)
  fullyParallel: false,
  workers: 1,

  // Fail CI on test.only
  forbidOnly: !!process.env.CI,

  // Allow 1 retry for flaky Stripe interactions
  retries: 1,

  // List reporter for clean console output
  reporter: 'list',

  use: {
    // Allow any certs
    ignoreHTTPSErrors: true,

    // Headless by default
    headless: true,

    // Capture screenshots at each step
    screenshot: 'on',

    // Capture trace for debugging
    trace: 'on',

    // Capture video on failure (helpful for Stripe debugging)
    video: 'on-first-retry',

    // Slower actions for Stripe form stability
    actionTimeout: 15000,
  },

  // Output directory for test artifacts
  outputDir: 'playwright/test-results-registration',

  // 5 minute timeout - Stripe checkout can be slow
  timeout: 300000,

  // Increase expect timeout for Stripe elements
  expect: {
    timeout: 15000,
  },

  projects: [
    {
      name: 'chromium-registration',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
