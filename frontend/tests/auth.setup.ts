import { chromium } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');
const BASE_URL = process.env.BASE_URL || 'https://mirai-uat.sogos.io';

async function globalSetup() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/dashboard`);

  console.log('\n========================================');
  console.log('Please log in manually in the browser.');
  console.log('Once you see the dashboard, press Enter here.');
  console.log('========================================\n');

  // Wait for the dashboard to load (user has logged in)
  await page.waitForURL('**/dashboard', { timeout: 300_000 });

  // Save auth state
  await context.storageState({ path: AUTH_FILE });
  console.log(`Auth state saved to ${AUTH_FILE}`);

  await browser.close();
}

globalSetup();
