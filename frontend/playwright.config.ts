import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, AUTH } from './e2e/config';

/**
 * Playwright configuration for Mirai E2E tests.
 *
 * Targets UAT environment at https://mirai-uat.sogos.io
 *
 * Auth Setup:
 *   Auth state is stored in e2e/.auth/user.json. To refresh:
 *   npx playwright codegen https://mirai-uat.sogos.io/auth/login --save-storage=./e2e/.auth/user.json --ignore-https-errors
 *
 * Test Structure:
 * - e2e/tests/wizard.spec.ts - Course creation wizard tests
 * - e2e/tests/image-generation.spec.ts - Image generation tests
 *
 * Usage:
 *   npx playwright test                           # Run all tests headless
 *   npx playwright test tests/wizard.spec.ts      # Run wizard tests only
 *   npx playwright test --headed                  # Run with browser visible
 *   npx playwright test --ui                      # Run with Playwright UI
 */
export default defineConfig({
  testDir: './e2e/tests',

  // Run tests sequentially - auth state is shared
  fullyParallel: false,
  workers: 1,

  // Fail CI on test.only
  forbidOnly: !!process.env.CI,

  // No retries - we want to see failures immediately
  retries: 0,

  // List reporter for clean console output
  reporter: 'list',

  use: {
    // UAT environment (from config)
    baseURL: BASE_URL,

    // Allow self-signed certs
    ignoreHTTPSErrors: true,

    // Headless by default
    headless: true,

    // Capture screenshots at each step
    screenshot: 'on',

    // Capture trace for debugging
    trace: 'on',

    // Use manually saved auth state
    storageState: AUTH.stateFile,
  },

  // Output directory for test artifacts
  outputDir: 'playwright/test-results',

  // 10 minute timeout - wizard with AI generation can take time
  timeout: 600000,

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
