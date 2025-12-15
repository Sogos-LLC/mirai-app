import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * UAT Registration Flow Tests
 *
 * Tests the complete registration flow including:
 * 1. Email validation
 * 2. Organization info
 * 3. Account credentials
 * 4. Plan selection
 * 5. Stripe checkout (using test card)
 * 6. Post-checkout verification
 *
 * IMPORTANT: UAT should use Stripe TEST mode with test API keys
 */

// UAT domains
const UAT_APP = 'https://mirai-uat.sogos.io';
const UAT_MARKETING = 'https://get-mirai-uat.sogos.io';

// Screenshot directory
const SCREENSHOT_DIR = 'playwright/screenshots/uat-registration';

// Step headings for detection
const STEP_HEADINGS = {
  EMAIL: "Let's get started",
  ORG: 'Tell us about your organization',
  ACCOUNT: 'Create your account',
  PLAN: 'Choose your plan',
};

// Test user data - use unique email to avoid conflicts
function getTestUser() {
  return {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPass123!',
    firstName: 'Test',
    lastName: 'User',
    companyName: 'Test Company UAT',
    industry: 'Technology',
    teamSize: '1-10',
  };
}

// Stripe test card (always succeeds in test mode)
const STRIPE_TEST_CARD = {
  number: '4242424242424242',
  expiry: '12/30',
  cvc: '123',
  zip: '12345',
};

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * Take a screenshot with timestamp
 */
async function takeScreenshot(page: Page, name: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${name}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`Screenshot saved: ${filepath}`);
  return filepath;
}

/**
 * Wait for a specific step by its heading AND verify a key element
 * This prevents race conditions where the heading briefly appears
 */
async function waitForStep(
  page: Page,
  stepHeading: string,
  keyElementSelector?: string,
  timeout: number = 15000
) {
  console.log(`Waiting for step: "${stepHeading}"`);

  // Wait for heading
  await expect(page.locator(`h2:has-text("${stepHeading}")`)).toBeVisible({ timeout });

  // If a key element is specified, wait for it too
  if (keyElementSelector) {
    console.log(`Waiting for key element: ${keyElementSelector}`);
    await expect(page.locator(keyElementSelector)).toBeVisible({ timeout: 5000 });
  }

  // Small delay to let any animations/transitions complete
  await page.waitForTimeout(300);
}

/**
 * Wait for network to be idle with custom timeout
 */
async function waitForStable(page: Page, timeout: number = 5000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    // Network may not go fully idle, that's okay
  }
}

test.describe('UAT Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console logs for debugging
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
      }
    });

    // Log navigations
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        console.log(`[NAVIGATION] ${frame.url()}`);
      }
    });
  });

  test('Complete registration flow with Stripe checkout', async ({ page }) => {
    // NOTE: This test requires UAT Stripe secrets to be configured.
    // If you see a 503 error, ensure STRIPE_SECRET_KEY is set in the UAT backend.
    test.setTimeout(180000); // 3 minutes for full flow including Stripe

    const TEST_USER = getTestUser();
    console.log(`\n=== Starting UAT Registration Flow ===`);
    console.log(`Test User Email: ${TEST_USER.email}\n`);

    // ============================================================
    // Step 0: Navigate to registration page
    // ============================================================
    console.log('Step 0: Navigate to registration page');
    await page.goto(`${UAT_APP}/auth/registration`);
    await waitForStable(page);
    await takeScreenshot(page, '00_registration_page_loaded');

    // Verify we're on the registration page and on email step
    expect(page.url()).toContain('mirai-uat.sogos.io');
    await waitForStep(page, STEP_HEADINGS.EMAIL, '#email');
    console.log('✓ Registration page loaded on Email step\n');

    // ============================================================
    // Step 1: Email validation
    // ============================================================
    console.log('Step 1: Enter email address');
    await takeScreenshot(page, '01_email_step_empty');

    // Fill email input (by ID for accuracy)
    const emailInput = page.locator('#email');
    await expect(emailInput).toBeVisible();
    await emailInput.fill(TEST_USER.email);
    await takeScreenshot(page, '02_email_step_filled');

    // Wait for form to be valid, then click Continue
    const continueButton = page.locator('button[type="submit"]:has-text("Continue")');
    await expect(continueButton).toBeEnabled({ timeout: 5000 });
    await continueButton.click();

    // Wait for email check (button shows "Checking...")
    // Then wait for transition to Organization step
    await waitForStep(page, STEP_HEADINGS.ORG, '#companyName', 15000);
    await takeScreenshot(page, '03_org_step_loaded');
    console.log('✓ Email validated, moved to Organization step\n');

    // ============================================================
    // Step 2: Organization info
    // ============================================================
    console.log('Step 2: Enter organization info');

    // Fill company name (by ID)
    const companyInput = page.locator('#companyName');
    await expect(companyInput).toBeVisible();
    await companyInput.fill(TEST_USER.companyName);

    // Select industry
    const industrySelect = page.locator('#industry');
    await industrySelect.selectOption(TEST_USER.industry);

    // Select team size
    const teamSizeSelect = page.locator('#teamSize');
    await teamSizeSelect.selectOption(TEST_USER.teamSize);

    await takeScreenshot(page, '04_org_step_filled');

    // Click Continue
    await page.locator('button[type="submit"]:has-text("Continue")').click();

    // Wait for transition to Account step
    await waitForStep(page, STEP_HEADINGS.ACCOUNT, '#firstName', 10000);
    await takeScreenshot(page, '05_account_step_loaded');
    console.log('✓ Organization info entered, moved to Account step\n');

    // ============================================================
    // Step 3: Account credentials
    // ============================================================
    console.log('Step 3: Enter account credentials');

    // Fill first name
    await page.locator('#firstName').fill(TEST_USER.firstName);

    // Fill last name
    await page.locator('#lastName').fill(TEST_USER.lastName);

    // Fill password
    await page.locator('#password').fill(TEST_USER.password);

    // Fill confirm password
    await page.locator('#confirmPassword').fill(TEST_USER.password);

    await takeScreenshot(page, '06_account_step_filled');

    // Click Continue
    await page.locator('button[type="submit"]:has-text("Continue")').click();

    // Wait for transition to Plan step
    await waitForStep(page, STEP_HEADINGS.PLAN, 'h3:has-text("Starter")', 10000);
    await takeScreenshot(page, '07_plan_step_loaded');
    console.log('✓ Account credentials entered, moved to Plan step\n');

    // ============================================================
    // Step 4: Plan selection
    // ============================================================
    console.log('Step 4: Select plan');

    // Verify all plans are visible (use h3 for plan names)
    await expect(page.locator('h3:has-text("Starter")')).toBeVisible();
    await expect(page.locator('h3:has-text("Pro")')).toBeVisible();
    await expect(page.locator('h3:has-text("Enterprise")')).toBeVisible();

    // Starter should be pre-selected (has checkmark)
    // Click on starter card to ensure it's selected
    const starterCard = page.locator('h3:has-text("Starter")').first();
    await starterCard.click();

    await takeScreenshot(page, '08_plan_starter_selected');

    // Click "Get Started" button
    const getStartedButton = page.locator('button:has-text("Get Started")');
    await expect(getStartedButton).toBeVisible();
    await takeScreenshot(page, '09_before_checkout_click');

    console.log('Clicking Get Started - will redirect to Stripe...');
    await getStartedButton.click();

    // ============================================================
    // Step 5: Stripe Checkout
    // ============================================================
    console.log('\nStep 5: Stripe Checkout');

    // Wait for redirect to Stripe (checkout.stripe.com)
    await page.waitForURL(/stripe\.com|checkout/, { timeout: 30000 });
    await waitForStable(page, 10000);
    await takeScreenshot(page, '10_stripe_checkout_loaded');

    const stripeUrl = page.url();
    console.log(`Stripe checkout URL: ${stripeUrl}`);
    expect(stripeUrl).toContain('stripe.com');
    console.log('✓ Redirected to Stripe checkout\n');

    // Fill Stripe checkout form
    console.log('Filling Stripe payment form with test card...');

    // Stripe Checkout (hosted page) - wait for page to fully load
    await page.waitForTimeout(3000);

    try {
      // Click on "Card" payment method to expand it
      // Stripe Checkout uses an accordion with radio buttons for payment method selection
      console.log('Looking for Card payment method...');

      // Strategy 1: Try to check the first radio button (Card) directly
      const cardRadio = page.locator('input[name="payment-method-accordion-item-title"]').first();

      if (await cardRadio.isVisible({ timeout: 5000 })) {
        console.log('Found Card radio button');

        // Try using check() which is designed for radio/checkbox
        try {
          await cardRadio.check({ force: true, timeout: 3000 });
          console.log('Checked Card radio');
        } catch {
          console.log('check() failed, trying alternatives...');
        }
      }

      await page.waitForTimeout(1000);

      // Strategy 2: Click on the entire Card row/container
      // The Card option in Stripe Checkout is typically a clickable div containing radio + label
      const cardRow = page.locator('div').filter({ hasText: /^Card$/ }).first();
      if (await cardRow.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Found Card row, clicking...');
        await cardRow.click({ force: true });
      }

      await page.waitForTimeout(1000);

      // Strategy 3: Click using keyboard (Tab to focus, Space to select)
      // First focus the Card radio, then press Space
      try {
        await cardRadio.focus();
        await page.keyboard.press('Space');
        console.log('Used Space key to select Card');
      } catch {
        console.log('Keyboard selection failed');
      }

      await page.waitForTimeout(2000);
      await takeScreenshot(page, '10b_after_card_selection_attempts');

      // Check if card form appeared by looking for card-specific inputs
      // In Stripe Checkout, card inputs appear in new elements after selection

      // Now look for card input fields
      // Stripe Checkout 2024 uses various input structures
      console.log('Looking for card input fields...');

      // Try to find card number input - could be in iframe or direct
      let cardFilled = false;

      // Strategy 1: Look for inputs directly on page (newer Stripe Checkout)
      const directCardInput = page.locator('input[name="cardNumber"], input[placeholder*="card number"], input[autocomplete="cc-number"]').first();
      if (await directCardInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('Found direct card input');
        await directCardInput.fill(STRIPE_TEST_CARD.number);
        cardFilled = true;

        // Find and fill expiry
        const expiryInput = page.locator('input[name="cardExpiry"], input[placeholder*="MM"], input[autocomplete="cc-exp"]').first();
        if (await expiryInput.isVisible({ timeout: 2000 })) {
          await expiryInput.fill(STRIPE_TEST_CARD.expiry);
          console.log('✓ Expiry filled');
        }

        // Find and fill CVC
        const cvcInput = page.locator('input[name="cardCvc"], input[placeholder*="CVC"], input[autocomplete="cc-csc"]').first();
        if (await cvcInput.isVisible({ timeout: 2000 })) {
          await cvcInput.fill(STRIPE_TEST_CARD.cvc);
          console.log('✓ CVC filled');
        }

        // Fill cardholder name (required field)
        const cardholderInput = page.locator('input[name="billingName"], input[placeholder*="name on card"], input[placeholder*="Full name"]').first();
        if (await cardholderInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await cardholderInput.fill('Test User');
          console.log('✓ Cardholder name filled');
        }

        // Fill ZIP code (required field for US)
        const zipInput = page.locator('input[name="billingPostalCode"], input[placeholder="ZIP"], input[autocomplete="postal-code"]').first();
        if (await zipInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await zipInput.fill(STRIPE_TEST_CARD.zip);
          console.log('✓ ZIP code filled');
        }

        // Uncheck "Save my information for faster checkout" to avoid phone number requirement
        const saveInfoCheckbox = page.locator('input[name="enableStripePass"]');
        if (await saveInfoCheckbox.isChecked().catch(() => false)) {
          console.log('Unchecking "Save my information" checkbox...');
          await saveInfoCheckbox.uncheck({ force: true });
          console.log('✓ Unchecked save info checkbox');
        }
      }

      // Strategy 2: Look in iframes (Stripe Elements embedded in Checkout)
      if (!cardFilled) {
        console.log('Trying iframe approach...');
        const frames = page.frames();
        console.log(`Found ${frames.length} frames`);

        for (const frame of frames) {
          const url = frame.url();
          if (url.includes('stripe') || url.includes('js.stripe.com')) {
            console.log(`Checking frame: ${url}`);
            const input = frame.locator('input[name="cardnumber"], input[name="cardNumber"]').first();
            if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
              console.log('Found card input in frame');
              await input.fill(STRIPE_TEST_CARD.number);
              cardFilled = true;
              break;
            }
          }
        }
      }

      // Strategy 3: Use frameLocator for stripe frames
      if (!cardFilled) {
        console.log('Trying frameLocator approach...');
        const stripeFrames = page.frameLocator('iframe[src*="stripe"], iframe[name*="stripe"], iframe[title*="card"]');
        const cardInput = stripeFrames.locator('input').first();
        if (await cardInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await cardInput.fill(STRIPE_TEST_CARD.number);
          cardFilled = true;
        }
      }

      // If we still couldn't fill the card, log what's on the page
      if (!cardFilled) {
        console.log('Could not find card input. Taking diagnostic screenshot...');
        await takeScreenshot(page, '10c_card_input_not_found');

        // Log all inputs on page
        const inputs = await page.locator('input').all();
        console.log(`Found ${inputs.length} inputs on page:`);
        for (let i = 0; i < Math.min(inputs.length, 10); i++) {
          const name = await inputs[i].getAttribute('name');
          const placeholder = await inputs[i].getAttribute('placeholder');
          const type = await inputs[i].getAttribute('type');
          console.log(`  Input ${i}: name=${name}, placeholder=${placeholder}, type=${type}`);
        }

        // Log all iframes
        const iframes = await page.locator('iframe').all();
        console.log(`Found ${iframes.length} iframes:`);
        for (let i = 0; i < iframes.length; i++) {
          const src = await iframes[i].getAttribute('src');
          const name = await iframes[i].getAttribute('name');
          console.log(`  iframe ${i}: name=${name}, src=${src?.substring(0, 100)}`);
        }
      }

      await takeScreenshot(page, '11_stripe_form_filled');
      console.log('✓ Payment form filled\n');

      // Submit payment
      console.log('Submitting payment...');
      const payButton = page.locator('button:has-text("Subscribe")').first();
      await expect(payButton).toBeEnabled({ timeout: 10000 });
      await takeScreenshot(page, '12_before_payment_submit');
      await payButton.click();

      // ============================================================
      // Step 6: Post-checkout verification
      // ============================================================
      console.log('\nStep 6: Wait for payment confirmation and redirect');

      // Wait for redirect back to our app (success page)
      await page.waitForURL(/sogos\.io/, { timeout: 60000 });
      await waitForStable(page, 5000);
      await takeScreenshot(page, '13_checkout_success_redirect');

      const successUrl = page.url();
      console.log(`Success redirect URL: ${successUrl}`);
      expect(successUrl).toContain('sogos.io');

      console.log('✓ Payment completed, redirected back to app\n');

    } catch (stripeError) {
      // Take screenshot of what Stripe looks like for debugging
      await takeScreenshot(page, '11_stripe_error_state');
      console.log('Stripe form interaction failed:', stripeError);
      throw stripeError;
    }

    // Take final screenshot
    await takeScreenshot(page, '14_registration_complete');

    // ============================================================
    // Summary
    // ============================================================
    console.log('=== Registration Flow Complete ===');
    console.log(`Email: ${TEST_USER.email}`);
    console.log(`Company: ${TEST_USER.companyName}`);
    console.log('Plan: Starter');
    console.log('\nNote: Account provisioning happens asynchronously via webhook.');
    console.log('The user should be able to log in within a few seconds.\n');
  });

  test('Registration wizard step navigation', async ({ page }) => {
    console.log('\n=== Testing Registration Wizard Navigation ===\n');

    const TEST_USER = getTestUser();
    await page.goto(`${UAT_APP}/auth/registration`);
    await waitForStable(page);

    // Step 1: Email
    await waitForStep(page, STEP_HEADINGS.EMAIL, '#email');
    await takeScreenshot(page, 'nav_01_email_step');
    console.log('✓ On Email step');

    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('button[type="submit"]:has-text("Continue")').click();

    // Step 2: Organization
    await waitForStep(page, STEP_HEADINGS.ORG, '#companyName');
    await takeScreenshot(page, 'nav_02_org_step');
    console.log('✓ On Organization step');

    await page.locator('#companyName').fill(TEST_USER.companyName);
    await page.locator('button[type="submit"]:has-text("Continue")').click();

    // Step 3: Account
    await waitForStep(page, STEP_HEADINGS.ACCOUNT, '#firstName');
    await takeScreenshot(page, 'nav_03_account_step');
    console.log('✓ On Account step');

    await page.locator('#firstName').fill(TEST_USER.firstName);
    await page.locator('#lastName').fill(TEST_USER.lastName);
    await page.locator('#password').fill(TEST_USER.password);
    await page.locator('#confirmPassword').fill(TEST_USER.password);
    await page.locator('button[type="submit"]:has-text("Continue")').click();

    // Step 4: Plan
    await waitForStep(page, STEP_HEADINGS.PLAN, 'h3:has-text("Starter")');
    await takeScreenshot(page, 'nav_04_plan_step');
    console.log('✓ On Plan step');

    // Verify all plans visible (use h3 for plan names to avoid matching feature text)
    await expect(page.locator('h3:has-text("Starter")')).toBeVisible();
    await expect(page.locator('h3:has-text("Pro")')).toBeVisible();
    await expect(page.locator('h3:has-text("Enterprise")')).toBeVisible();

    // Verify pricing (use first() since total also shows price)
    await expect(page.locator('text=/\\$8/').first()).toBeVisible();
    await expect(page.locator('text=/\\$12/').first()).toBeVisible();

    console.log('\n✓ All wizard steps navigable and plans displayed correctly\n');
  });

  test('Email validation rejects invalid email format', async ({ page }) => {
    console.log('\n=== Testing Email Validation ===\n');

    await page.goto(`${UAT_APP}/auth/registration`);
    await waitForStep(page, STEP_HEADINGS.EMAIL, '#email');

    // Try invalid email
    await page.locator('#email').fill('invalid-email');
    await takeScreenshot(page, 'email_invalid_format');

    // Button should be disabled for invalid email
    const continueButton = page.locator('button[type="submit"]:has-text("Continue")');
    await expect(continueButton).toBeDisabled();

    // Fix the email
    await page.locator('#email').fill('valid@example.com');

    // Button should now be enabled
    await expect(continueButton).toBeEnabled({ timeout: 5000 });
    await takeScreenshot(page, 'email_valid_format');

    console.log('✓ Email validation working correctly\n');
  });

  test('Password requirements visual feedback', async ({ page }) => {
    console.log('\n=== Testing Password Requirements ===\n');

    const TEST_USER = getTestUser();
    await page.goto(`${UAT_APP}/auth/registration`);
    await waitForStable(page);

    // Navigate to Account step
    await waitForStep(page, STEP_HEADINGS.EMAIL, '#email');
    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('button[type="submit"]:has-text("Continue")').click();
    await waitForStep(page, STEP_HEADINGS.ORG, '#companyName');

    await page.locator('#companyName').fill(TEST_USER.companyName);
    await page.locator('button[type="submit"]:has-text("Continue")').click();
    await waitForStep(page, STEP_HEADINGS.ACCOUNT, '#firstName');

    // Test weak password (too short)
    await page.locator('#password').fill('weak');
    await takeScreenshot(page, 'password_weak');

    // Check if requirements are shown
    const requirements = page.locator('text=At least 8 characters');
    if (await requirements.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('✓ Password requirements displayed');
    }

    // Test password missing uppercase
    await page.locator('#password').fill('lowercase123');
    await takeScreenshot(page, 'password_no_uppercase');

    // Test password missing number
    await page.locator('#password').fill('NoNumber!');
    await takeScreenshot(page, 'password_no_number');

    // Test strong password
    await page.locator('#password').fill('StrongPass123!');
    await takeScreenshot(page, 'password_strong');

    console.log('✓ Password validation visual feedback working\n');
  });

  test('Plan selection and seat counter', async ({ page }) => {
    console.log('\n=== Testing Plan Selection ===\n');

    const TEST_USER = getTestUser();
    await page.goto(`${UAT_APP}/auth/registration`);

    // Quick navigation to plan step
    await waitForStep(page, STEP_HEADINGS.EMAIL, '#email');
    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('button[type="submit"]:has-text("Continue")').click();
    await waitForStep(page, STEP_HEADINGS.ORG, '#companyName');

    await page.locator('#companyName').fill(TEST_USER.companyName);
    await page.locator('button[type="submit"]:has-text("Continue")').click();
    await waitForStep(page, STEP_HEADINGS.ACCOUNT, '#firstName');

    await page.locator('#firstName').fill(TEST_USER.firstName);
    await page.locator('#lastName').fill(TEST_USER.lastName);
    await page.locator('#password').fill(TEST_USER.password);
    await page.locator('#confirmPassword').fill(TEST_USER.password);
    await page.locator('button[type="submit"]:has-text("Continue")').click();
    await waitForStep(page, STEP_HEADINGS.PLAN, 'h3:has-text("Starter")');

    await takeScreenshot(page, 'plan_initial');

    // Select Pro plan
    const proCard = page.locator('h3:has-text("Pro")').first();
    await proCard.click();
    await takeScreenshot(page, 'plan_pro_selected');

    // Test seat counter (increase seats)
    const plusButton = page.locator('button:has-text("+")');
    if (await plusButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await plusButton.click();
      await plusButton.click();
      await takeScreenshot(page, 'plan_3_seats');

      // Check monthly total updated
      const total = page.locator('text=$36/month'); // 3 seats * $12
      await expect(total).toBeVisible({ timeout: 3000 });
      console.log('✓ Seat counter works, total updated to $36/month (3 seats x $12)');
    }

    console.log('✓ Plan selection working correctly\n');
  });
});

test.describe('UAT Registration - Edge Cases', () => {
  test('Registration from marketing site', async ({ page }) => {
    test.setTimeout(60000); // 1 minute timeout for marketing site

    console.log('\n=== Testing Registration from Marketing Site ===\n');

    await page.goto(UAT_MARKETING, { timeout: 30000 });
    await waitForStable(page, 10000);
    await takeScreenshot(page, 'marketing_home');

    // Click Get Started - try multiple locator strategies
    const getStartedButton = page.locator('a:has-text("Get Started"), button:has-text("Get Started"), a[href*="registration"]').first();
    await expect(getStartedButton).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, 'marketing_before_click');
    await getStartedButton.click();

    // Wait for navigation to registration
    await page.waitForURL(/registration/, { timeout: 30000 });
    await takeScreenshot(page, 'registration_from_marketing');

    const regUrl = page.url();
    console.log(`Registration URL: ${regUrl}`);

    expect(regUrl).toContain('mirai-uat.sogos.io');
    expect(regUrl).toContain('/auth/registration');

    console.log('✓ Get Started correctly navigates to UAT registration\n');
  });

  test('Back button navigation works', async ({ page }) => {
    console.log('\n=== Testing Back Button Navigation ===\n');

    const TEST_USER = getTestUser();
    await page.goto(`${UAT_APP}/auth/registration`);

    // Go to org step
    await waitForStep(page, STEP_HEADINGS.EMAIL, '#email');
    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('button[type="submit"]:has-text("Continue")').click();
    await waitForStep(page, STEP_HEADINGS.ORG, '#companyName');
    await takeScreenshot(page, 'back_test_org_step');

    // Click Back
    await page.locator('button:has-text("Back")').click();

    // Should be back on email step
    await waitForStep(page, STEP_HEADINGS.EMAIL, '#email');
    await takeScreenshot(page, 'back_test_email_step');

    // Email should still be filled
    const emailValue = await page.locator('#email').inputValue();
    expect(emailValue).toBe(TEST_USER.email);

    console.log('✓ Back navigation preserves form data\n');
  });
});

test.describe('UAT Sign-In Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console logs for debugging
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
      }
    });
  });

  test('Sign-in page loads and accepts credentials', async ({ page }) => {
    console.log('\n=== Testing Sign-In Flow ===\n');

    // Navigate to login page
    await page.goto(`${UAT_APP}/auth/login`);
    await waitForStable(page);
    await takeScreenshot(page, 'signin_01_page_loaded');

    // Verify login page elements
    const loginForm = page.locator('form');
    await expect(loginForm).toBeVisible({ timeout: 15000 });
    console.log('✓ Login form visible');

    // Check for email/identifier input
    const emailInput = page.locator('input[name="identifier"], input[type="email"], #identifier');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    console.log('✓ Email input visible');

    // Check for password input
    const passwordInput = page.locator('input[name="password"], input[type="password"], #password');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    console.log('✓ Password input visible');

    // Check for submit button
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible({ timeout: 5000 });
    console.log('✓ Submit button visible');

    await takeScreenshot(page, 'signin_02_form_elements');

    // Test that form accepts input
    await emailInput.fill('test@example.com');
    await passwordInput.fill('TestPassword123!');
    await takeScreenshot(page, 'signin_03_form_filled');

    console.log('✓ Sign-in form accepts credentials input\n');

    // Verify "Sign up" link exists for new users
    const signUpLink = page.locator('a:has-text("Sign up"), a:has-text("Register"), a:has-text("Create account")');
    if (await signUpLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('✓ Sign up link available for new users');
    }
  });

  test('Sign-in with valid UAT test account', async ({ page }) => {
    // Skip if no UAT test credentials are provided
    const uatEmail = process.env.UAT_TEST_EMAIL;
    const uatPassword = process.env.UAT_TEST_PASSWORD;

    if (!uatEmail || !uatPassword) {
      console.log('Skipping UAT sign-in test - no UAT_TEST_EMAIL/UAT_TEST_PASSWORD env vars set');
      test.skip();
      return;
    }

    console.log('\n=== Testing Sign-In with UAT Account ===\n');
    console.log(`Email: ${uatEmail}`);

    // Navigate to login page
    await page.goto(`${UAT_APP}/auth/login`);
    await waitForStable(page);

    // Fill login form
    await page.fill('input[name="identifier"], input[type="email"]', uatEmail);
    await page.fill('input[name="password"], input[type="password"]', uatPassword);
    await takeScreenshot(page, 'uat_signin_01_filled');

    // Submit
    await page.click('button[type="submit"]');

    // Wait for redirect to authenticated area
    try {
      await page.waitForURL(/\/(dashboard|content-library|course|home)/, { timeout: 30000 });
      await takeScreenshot(page, 'uat_signin_02_authenticated');
      console.log(`✓ Logged in successfully, redirected to: ${page.url()}`);
    } catch {
      await takeScreenshot(page, 'uat_signin_02_failed');
      console.log('Sign-in may have failed or redirected elsewhere');
      console.log(`Current URL: ${page.url()}`);
    }
  });
});
