import { defineConfig, devices } from '@playwright/test';

// Environment-based URL configuration
// Default to k3d local setup, override via environment variables
const BASE_URL = process.env.BASE_URL || 'https://mirai.local';
const USE_LOCAL_SERVER = process.env.USE_LOCAL_SERVER === 'true';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Ignore HTTPS errors for mkcert certificates in local development
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Only use webServer when explicitly testing against local dev server
  // For k3d cluster testing, set USE_LOCAL_SERVER=false (default)
  ...(USE_LOCAL_SERVER && {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  }),
  outputDir: 'e2e/test-results',
  // Increase timeout for local k3d cluster
  timeout: 30 * 1000, // 30 seconds per test
  expect: {
    timeout: 10 * 1000, // 10 seconds for assertions
  },
});
