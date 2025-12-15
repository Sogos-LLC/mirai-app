import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * UAT Environment Redirect Tests
 *
 * These tests verify that the UAT marketing site (get-mirai-uat.sogos.io)
 * correctly redirects auth links to the UAT app (mirai-uat.sogos.io)
 * and NEVER to production (mirai.sogos.io or get-mirai.sogos.io).
 *
 * CRITICAL: Production domains should never appear in UAT flows.
 */

// UAT domains
const UAT_MARKETING = 'https://get-mirai-uat.sogos.io';
const UAT_APP = 'https://mirai-uat.sogos.io';
const UAT_AUTH = 'https://mirai-auth-uat.sogos.io';
const UAT_API = 'https://mirai-api-uat.sogos.io';

// Production domains - these should NEVER appear in UAT tests
const PROD_DOMAINS = [
  'mirai.sogos.io',
  'get-mirai.sogos.io',
  'mirai-api.sogos.io',
  'mirai-auth.sogos.io',
];

// Screenshot directory
const SCREENSHOT_DIR = 'playwright/screenshots/uat-redirects';

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * Helper to verify URL is UAT and NOT production
 */
function assertUATDomain(url: string, context: string) {
  // Check it's not production
  for (const prodDomain of PROD_DOMAINS) {
    if (url.includes(prodDomain)) {
      throw new Error(
        `CRITICAL: ${context} - URL "${url}" contains PRODUCTION domain "${prodDomain}". ` +
        `UAT should NEVER redirect to production!`
      );
    }
  }

  // Verify it's a UAT domain
  const isUAT = url.includes('mirai-uat.sogos.io') ||
                url.includes('get-mirai-uat.sogos.io') ||
                url.includes('mirai-auth-uat.sogos.io') ||
                url.includes('mirai-api-uat.sogos.io');

  if (!isUAT) {
    throw new Error(
      `${context} - URL "${url}" is not a recognized UAT domain. ` +
      `Expected one of: mirai-uat.sogos.io, get-mirai-uat.sogos.io, mirai-auth-uat.sogos.io, mirai-api-uat.sogos.io`
    );
  }
}

/**
 * Take a screenshot with timestamp
 */
async function takeScreenshot(page: any, name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${name}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`Screenshot saved: ${filepath}`);
  return filepath;
}

test.describe('UAT Marketing Site Redirects', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console logs
    page.on('console', msg => {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    // Capture any page errors
    page.on('pageerror', err => {
      console.error(`[PAGE ERROR] ${err.message}`);
    });

    // Log all navigations
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        console.log(`[NAVIGATION] ${frame.url()}`);
        // Assert every navigation is to UAT
        const url = frame.url();
        if (url.includes('sogos.io')) {
          assertUATDomain(url, 'Navigation');
        }
      }
    });
  });

  test('Marketing site loads correctly', async ({ page }) => {
    console.log(`\n=== Testing UAT Marketing Site: ${UAT_MARKETING} ===\n`);

    // Navigate to UAT marketing site
    await page.goto(UAT_MARKETING);

    // Verify we're on UAT marketing
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    assertUATDomain(currentUrl, 'Marketing site load');
    expect(currentUrl).toContain('get-mirai-uat.sogos.io');

    // Take screenshot
    await takeScreenshot(page, '01_marketing_home');

    // Verify page title or content indicates it's the marketing site
    await expect(page.locator('body')).toBeVisible();

    console.log('✓ Marketing site loaded successfully on UAT domain');
  });

  test('Sign In link redirects to UAT app auth', async ({ page }) => {
    console.log(`\n=== Testing Sign In Redirect ===\n`);

    // Start at marketing site
    await page.goto(UAT_MARKETING);
    await takeScreenshot(page, '02_before_signin_click');

    // Find and click Sign In link
    // Try multiple possible selectors
    const signInSelectors = [
      'a:has-text("Sign In")',
      'a:has-text("Sign in")',
      'a:has-text("Login")',
      'a[href*="/auth/login"]',
      'button:has-text("Sign In")',
      'button:has-text("Sign in")',
    ];

    let signInClicked = false;
    for (const selector of signInSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`Found Sign In element with selector: ${selector}`);
        await element.click();
        signInClicked = true;
        break;
      }
    }

    if (!signInClicked) {
      // Take screenshot to see what's on the page
      await takeScreenshot(page, '02_error_signin_not_found');
      throw new Error('Could not find Sign In link on marketing page');
    }

    // Wait for navigation
    await page.waitForLoadState('networkidle');

    // Get final URL
    const finalUrl = page.url();
    console.log(`Final URL after Sign In click: ${finalUrl}`);

    // Take screenshot of login page
    await takeScreenshot(page, '03_signin_redirect_result');

    // CRITICAL: Verify it's UAT, not production
    assertUATDomain(finalUrl, 'Sign In redirect');

    // Verify it's the login page on UAT app
    expect(finalUrl).toContain('mirai-uat.sogos.io');
    expect(finalUrl).toContain('/auth/login');

    console.log('✓ Sign In correctly redirects to UAT app login page');
    console.log(`  Expected: ${UAT_APP}/auth/login`);
    console.log(`  Actual:   ${finalUrl}`);
  });

  test('Register link redirects to UAT app registration', async ({ page }) => {
    console.log(`\n=== Testing Register Redirect ===\n`);

    // Start at marketing site
    await page.goto(UAT_MARKETING);
    await takeScreenshot(page, '04_before_register_click');

    // Find and click Register link
    const registerSelectors = [
      'a:has-text("Register")',
      'a:has-text("Sign Up")',
      'a:has-text("Sign up")',
      'a:has-text("Get Started")',
      'a[href*="/auth/register"]',
      'a[href*="/auth/registration"]',
      'button:has-text("Register")',
      'button:has-text("Sign Up")',
      'button:has-text("Get Started")',
    ];

    let registerClicked = false;
    for (const selector of registerSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`Found Register element with selector: ${selector}`);
        await element.click();
        registerClicked = true;
        break;
      }
    }

    if (!registerClicked) {
      // Take screenshot to see what's on the page
      await takeScreenshot(page, '04_error_register_not_found');
      throw new Error('Could not find Register link on marketing page');
    }

    // Wait for navigation
    await page.waitForLoadState('networkidle');

    // Get final URL
    const finalUrl = page.url();
    console.log(`Final URL after Register click: ${finalUrl}`);

    // Take screenshot of registration page
    await takeScreenshot(page, '05_register_redirect_result');

    // CRITICAL: Verify it's UAT, not production
    assertUATDomain(finalUrl, 'Register redirect');

    // Verify it's the registration page on UAT app
    expect(finalUrl).toContain('mirai-uat.sogos.io');
    expect(finalUrl.toLowerCase()).toMatch(/auth\/(register|registration)/);

    console.log('✓ Register correctly redirects to UAT app registration page');
    console.log(`  Expected: ${UAT_APP}/auth/registration`);
    console.log(`  Actual:   ${finalUrl}`);
  });

  test('All navigation links stay on UAT domains', async ({ page }) => {
    console.log(`\n=== Testing All Links Stay on UAT ===\n`);

    // Start at marketing site
    await page.goto(UAT_MARKETING);

    // Get all links on the page
    const links = await page.locator('a[href]').all();
    console.log(`Found ${links.length} links on the page`);

    const issues: string[] = [];
    const checkedLinks: string[] = [];

    for (const link of links) {
      const href = await link.getAttribute('href');
      if (!href) continue;

      // Skip external links, anchors, and non-http links
      if (href.startsWith('#') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:') ||
          href.startsWith('javascript:')) {
        continue;
      }

      // Resolve relative URLs
      let fullUrl = href;
      if (href.startsWith('/')) {
        fullUrl = `${UAT_MARKETING}${href}`;
      } else if (!href.startsWith('http')) {
        fullUrl = `${UAT_MARKETING}/${href}`;
      }

      // Check if it's a sogos.io link
      if (fullUrl.includes('sogos.io')) {
        checkedLinks.push(fullUrl);

        // Check for production domains
        for (const prodDomain of PROD_DOMAINS) {
          if (fullUrl.includes(prodDomain)) {
            issues.push(`Link "${href}" points to PRODUCTION domain: ${prodDomain}`);
          }
        }
      }
    }

    // Take screenshot showing all links
    await takeScreenshot(page, '06_all_links_check');

    console.log(`\nChecked ${checkedLinks.length} sogos.io links:`);
    checkedLinks.forEach(link => console.log(`  - ${link}`));

    if (issues.length > 0) {
      console.error('\n❌ PRODUCTION DOMAIN ISSUES FOUND:');
      issues.forEach(issue => console.error(`  - ${issue}`));
      throw new Error(`Found ${issues.length} links pointing to production domains:\n${issues.join('\n')}`);
    }

    console.log('\n✓ All links correctly point to UAT domains (no production leakage)');
  });

  test('UAT API endpoint is accessible', async ({ page }) => {
    console.log(`\n=== Testing UAT API Health ===\n`);

    // Test API health endpoint
    const response = await page.request.get(`${UAT_API}/health`);

    console.log(`API Health Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();

    await takeScreenshot(page, '07_api_health_check');

    console.log('✓ UAT API is healthy and accessible');
  });
});

test.describe('UAT App Direct Access', () => {
  test.beforeEach(async ({ page }) => {
    // Log all navigations and verify UAT
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        const url = frame.url();
        console.log(`[NAVIGATION] ${url}`);
        if (url.includes('sogos.io')) {
          assertUATDomain(url, 'Navigation');
        }
      }
    });
  });

  test('UAT app login page loads correctly', async ({ page }) => {
    console.log(`\n=== Testing UAT App Login Page ===\n`);

    // Navigate directly to UAT login
    await page.goto(`${UAT_APP}/auth/login`);

    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Should be on UAT (might redirect through Kratos)
    assertUATDomain(currentUrl, 'Direct login access');

    await takeScreenshot(page, '08_uat_app_login');

    // Verify login form or Kratos UI is visible
    await expect(page.locator('body')).toBeVisible();

    console.log('✓ UAT app login page loads correctly');
  });

  test('UAT app registration page loads correctly', async ({ page }) => {
    console.log(`\n=== Testing UAT App Registration Page ===\n`);

    // Navigate directly to UAT registration
    await page.goto(`${UAT_APP}/auth/registration`);

    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Should be on UAT (might redirect through Kratos)
    assertUATDomain(currentUrl, 'Direct registration access');

    await takeScreenshot(page, '09_uat_app_registration');

    // Verify registration form or Kratos UI is visible
    await expect(page.locator('body')).toBeVisible();

    console.log('✓ UAT app registration page loads correctly');
  });
});
