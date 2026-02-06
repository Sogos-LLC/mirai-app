import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://mirai-uat.sogos.io';

export default defineConfig({
  testDir: '.',
  outputDir: './results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: './results/html-report', open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    storageState: './tests/.auth/user.json',
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  // Global timeout: 30s default. Individual tests override for long operations.
  timeout: 30_000,

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
