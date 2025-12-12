import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_USER, KRATOS_ADMIN_URL, BASE_URL, AUTH, PATHS } from './config';

// Auth state file path
const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

/**
 * Global setup runs once before all tests.
 * Creates the test user (if needed) and saves authenticated state.
 */
async function globalSetup(config: FullConfig) {
  console.log('\n========== GLOBAL SETUP ==========');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test User: ${TEST_USER.email}`);
  console.log(`Kratos Admin: ${KRATOS_ADMIN_URL}`);

  // Ensure .auth directory exists
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Skip Kratos user creation if env var is set (user was registered manually)
  if (process.env.SKIP_USER_CREATION !== 'true') {
    // NOTE: This only creates the Kratos identity. For the backend to recognize the user,
    // they must be registered through the app's registration flow first.
    await ensureTestUserExists();
  } else {
    console.log('Skipping Kratos user creation (SKIP_USER_CREATION=true)');
  }

  // Login via browser and save auth state
  await loginAndSaveState(config);

  console.log('========== GLOBAL SETUP COMPLETE ==========\n');
}

/**
 * Creates the test user via Kratos Admin API if it doesn't exist.
 */
async function ensureTestUserExists() {
  console.log('\n--- Checking/Creating Test User ---');

  try {
    // Check if user already exists by searching identities
    const searchResponse = await fetch(
      `${KRATOS_ADMIN_URL}/admin/identities?credentials_identifier=${encodeURIComponent(TEST_USER.email)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.log(`Kratos search failed (${searchResponse.status}): ${errorText}`);
      console.log('Attempting to create user anyway...');
    } else {
      const identities = await searchResponse.json();
      if (identities && identities.length > 0) {
        console.log(`Test user already exists: ${TEST_USER.email}`);
        // Update password to ensure it's set correctly
        const identityId = identities[0].id;
        await updateUserPassword(identityId);
        return;
      }
    }

    // Create new identity
    console.log(`Creating test user: ${TEST_USER.email}`);
    const createResponse = await fetch(`${KRATOS_ADMIN_URL}/admin/identities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_id: 'user',
        traits: {
          email: TEST_USER.email,
          name: {
            first: TEST_USER.firstName,
            last: TEST_USER.lastName,
          },
        },
        state: 'active',
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create identity: ${createResponse.status} - ${errorText}`);
    }

    const identity = await createResponse.json();
    console.log(`Created identity: ${identity.id}`);

    // Set password
    await updateUserPassword(identity.id);

    console.log('Test user created successfully');
  } catch (error) {
    console.error('Error in ensureTestUserExists:', error);
    throw error;
  }
}

/**
 * Updates the user's password via Kratos Admin API.
 * Uses PUT with full identity payload as required by Kratos.
 */
async function updateUserPassword(identityId: string) {
  console.log(`Setting password for identity: ${identityId}`);

  const response = await fetch(
    `${KRATOS_ADMIN_URL}/admin/identities/${identityId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_id: 'user',
        state: 'active',
        traits: {
          email: TEST_USER.email,
          name: {
            first: TEST_USER.firstName,
            last: TEST_USER.lastName,
          },
        },
        credentials: {
          password: {
            config: {
              password: TEST_USER.password,
            },
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to set password: ${response.status} - ${errorText}`);
    // Don't throw - user might already have password set
  } else {
    console.log('Password set successfully');
  }
}

/**
 * Logs in via browser and saves the auth state.
 */
async function loginAndSaveState(config: FullConfig) {
  console.log('\n--- Logging in via Browser ---');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    // Navigate to login page
    const loginUrl = `${BASE_URL}${PATHS.auth.login}`;
    console.log(`Navigating to ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'networkidle' });

    // Wait for Kratos form to load
    await page.waitForSelector('form', { timeout: 15000 });

    // Take screenshot of login page
    await page.screenshot({
      path: 'playwright/screenshots/setup-01-login-page.png',
      fullPage: true,
    });
    console.log('Screenshot: setup-01-login-page.png');

    // Fill login form
    console.log(`Filling login form with ${TEST_USER.email}`);
    await page.fill('input[name="identifier"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);

    // Take screenshot before submit
    await page.screenshot({
      path: 'playwright/screenshots/setup-02-form-filled.png',
      fullPage: true,
    });
    console.log('Screenshot: setup-02-form-filled.png');

    // Submit form
    console.log('Submitting login form...');
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard or authenticated page
    await page.waitForURL(/\/(dashboard|content-library|course)/, {
      timeout: 30000,
    });

    console.log(`Logged in successfully, current URL: ${page.url()}`);

    // Take screenshot of authenticated state
    await page.screenshot({
      path: 'playwright/screenshots/setup-03-logged-in.png',
      fullPage: true,
    });
    console.log('Screenshot: setup-03-logged-in.png');

    // Save auth state
    await context.storageState({ path: AUTH_FILE });
    console.log(`Auth state saved to: ${AUTH_FILE}`);
  } catch (error) {
    // Take screenshot on failure
    await page.screenshot({
      path: 'playwright/screenshots/setup-error.png',
      fullPage: true,
    });
    console.error('Screenshot: setup-error.png');
    console.error('Login failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
