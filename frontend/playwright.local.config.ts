import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for local k3d development cluster smoke tests.
 *
 * Tests basic connectivity and page rendering without authentication.
 *
 * Usage:
 *   npx playwright test --config=playwright.local.config.ts
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: 'local-smoke.spec.ts',

  // Run tests sequentially
  fullyParallel: false,
  workers: 1,

  // No retries - we want to see failures immediately
  retries: 0,

  // List reporter for clean console output
  reporter: 'list',

  // NO global setup - we're just testing basic connectivity
  // globalSetup: undefined,

  use: {
    // Local development cluster
    baseURL: 'https://mirai.dev',

    // Allow self-signed certs (mkcert)
    ignoreHTTPSErrors: true,

    // Headless by default
    headless: true,

    // Capture screenshots at each step
    screenshot: 'on',

    // Capture trace for debugging
    trace: 'on',

    // No auth state needed for smoke tests
    // storageState: undefined,
  },

  // Output directory for test artifacts
  outputDir: 'playwright/test-results/local-smoke',

  // 60 second timeout
  timeout: 60000,

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
