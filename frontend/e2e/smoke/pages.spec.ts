import { test, expect } from '@playwright/test';

test.describe('Smoke Tests - Public Pages', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Mirai/i);
  });

  test('pricing page loads', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page).toHaveURL('/pricing');
    await expect(page.locator('text=Pricing')).toBeVisible();
  });

  test('login page loads', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('form')).toBeVisible();
  });

  test('registration page loads', async ({ page }) => {
    await page.goto('/auth/registration');
    await expect(page.locator('form')).toBeVisible();
  });

  test('help page loads', async ({ page }) => {
    await page.goto('/help');
    await expect(page).toHaveURL('/help');
  });
});

test.describe('Smoke Tests - Removed Pages Return 404', () => {
  test('SMEs page returns 404', async ({ page }) => {
    const response = await page.goto('/smes');
    expect(response?.status()).toBe(404);
  });

  test('target-audiences page returns 404', async ({ page }) => {
    const response = await page.goto('/target-audiences');
    expect(response?.status()).toBe(404);
  });
});

test.describe('Smoke Tests - Course Builder WIP', () => {
  test('course builder shows coming soon', async ({ page }) => {
    await page.goto('/course-builder');
    await expect(page.locator('text=Coming Soon')).toBeVisible();
    await expect(page.locator('text=Back to Content Library')).toBeVisible();
  });

  test('course builder back button works', async ({ page }) => {
    await page.goto('/course-builder');
    await page.click('text=Back to Content Library');
    await expect(page).toHaveURL('/content-library');
  });
});

test.describe('Smoke Tests - Placeholder Pages', () => {
  test('templates page loads', async ({ page }) => {
    await page.goto('/templates');
    await expect(page).toHaveURL('/templates');
  });

  test('tutorials page loads', async ({ page }) => {
    await page.goto('/tutorials');
    await expect(page).toHaveURL('/tutorials');
  });

  test('updates page loads', async ({ page }) => {
    await page.goto('/updates');
    await expect(page).toHaveURL('/updates');
  });
});
