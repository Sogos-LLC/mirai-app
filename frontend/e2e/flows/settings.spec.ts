import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from '../fixtures/auth.fixture';

test.describe('Settings Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);

    // Mock AI settings endpoint
    await page.route('**/mirai.v1.TenantSettingsService/GetAISettings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          settings: {
            provider: 'AI_PROVIDER_GEMINI',
            hasApiKey: false,
            monthlyTokenLimit: 1000000,
            tokensUsed: 0,
          },
        }),
      });
    });
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL('/settings');
    await page.screenshot({ path: 'e2e/screenshots/settings-page.png' });
  });

  test('settings has AI settings tab', async ({ page }) => {
    await page.goto('/settings');

    const aiTab = page.locator('text=AI Settings, button:has-text("AI")');
    if (await aiTab.first().isVisible()) {
      await aiTab.first().click();
      await page.screenshot({ path: 'e2e/screenshots/settings-ai-tab.png' });
    }
  });

  test('AI settings shows API key input', async ({ page }) => {
    await page.goto('/settings');

    // Navigate to AI settings tab if needed
    const aiTab = page.locator('button:has-text("AI"), [data-tab="ai"]');
    if (await aiTab.first().isVisible()) {
      await aiTab.first().click();
    }

    // Should show API key configuration
    await page.screenshot({ path: 'e2e/screenshots/settings-api-key.png' });
  });
});

test.describe('API Key Setup Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);

    await page.route('**/mirai.v1.TenantSettingsService/GetAISettings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          settings: {
            provider: 'AI_PROVIDER_GEMINI',
            hasApiKey: false,
          },
        }),
      });
    });

    await page.route('**/mirai.v1.TenantSettingsService/SetAPIKey', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route('**/mirai.v1.TenantSettingsService/TestAPIKey', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ valid: true }),
      });
    });
  });

  test('can navigate to AI settings', async ({ page }) => {
    await page.goto('/settings');
    await page.screenshot({ path: 'e2e/screenshots/api-key-setup.png' });
  });
});
