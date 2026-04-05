import { defineConfig, devices } from '@playwright/test';

const ENV_MAP: Record<string, string> = {
  uat: 'https://mirai-uat.sogos.io',
  dev: 'https://mirai-dev.sogos.io',
  prod: 'https://mirai.sogos.io',
};

const env = process.env.TEST_ENV || 'uat';
const BASE_URL = ENV_MAP[env] || env;

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
    storageState: `./tests/.auth/${env}.json`,
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
