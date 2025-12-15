import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for UAT environment redirect tests.
 *
 * These tests verify that the UAT environment correctly routes
 * auth flows through UAT domains and never touches production.
 *
 * Usage:
 *   npx playwright test --config=playwright.uat.config.ts
 */
export default defineConfig({
  // Only run UAT redirect tests
  testDir: './e2e/tests',
  testMatch: 'uat-redirects.spec.ts',

  // Run tests sequentially
  fullyParallel: false,
  workers: 1,

  // Fail CI on test.only
  forbidOnly: !!process.env.CI,

  // No retries - we want to see failures immediately
  retries: 0,

  // List reporter for clean console output
  reporter: 'list',

  // No global setup needed - these tests don't require authentication
  // globalSetup: undefined,

  use: {
    // No base URL - tests use explicit UAT URLs
    // baseURL: undefined,

    // Allow any certs
    ignoreHTTPSErrors: true,

    // Headless by default
    headless: true,

    // Capture screenshots at each step
    screenshot: 'on',

    // Capture trace for debugging
    trace: 'on',

    // Capture video on failure
    video: 'on-first-retry',

    // No storage state - public pages only
    // storageState: undefined,
  },

  // Output directory for test artifacts
  outputDir: 'playwright/test-results-uat',

  // 2 minute timeout - redirects should be fast
  timeout: 120000,

  projects: [
    {
      name: 'chromium-uat',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
