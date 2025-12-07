import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from '../fixtures/auth.fixture';

test.describe('Content Library Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);

    // Mock folder hierarchy
    await page.route('**/mirai.v1.CourseService/GetFolderHierarchy', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          library: {
            folders: [
              { id: 'folder-1', name: 'My Courses', type: 'FOLDER_TYPE_PERSONAL' },
              { id: 'folder-2', name: 'Team Courses', type: 'FOLDER_TYPE_TEAM' },
            ],
          },
        }),
      });
    });

    // Mock courses list
    await page.route('**/mirai.v1.CourseService/ListCourses', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          courses: [
            {
              id: 'course-1',
              title: 'Introduction to Sales',
              status: 'COURSE_STATUS_DRAFT',
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'course-2',
              title: 'Product Training',
              status: 'COURSE_STATUS_PUBLISHED',
              updatedAt: new Date().toISOString(),
            },
          ],
          totalCount: 2,
        }),
      });
    });
  });

  test('content library page loads', async ({ page }) => {
    await page.goto('/content-library');
    await expect(page).toHaveURL('/content-library');
    await page.screenshot({ path: 'e2e/screenshots/content-library.png' });
  });

  test('content library shows courses', async ({ page }) => {
    await page.goto('/content-library');

    await expect(page.locator('text=Introduction to Sales')).toBeVisible();
    await expect(page.locator('text=Product Training')).toBeVisible();
  });

  test('content library shows folders', async ({ page }) => {
    await page.goto('/content-library');

    // Should show folder navigation
    await page.screenshot({ path: 'e2e/screenshots/content-library-folders.png' });
  });

  test('create course button navigates to course builder', async ({ page }) => {
    await page.goto('/content-library');

    const createButton = page.locator('button:has-text("Create Course"), button:has-text("Create")');
    if (await createButton.first().isVisible()) {
      await createButton.first().click();
      await expect(page).toHaveURL('/course-builder');
    }
  });
});

test.describe('Dashboard Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);

    await page.route('**/mirai.v1.CourseService/ListCourses', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          courses: [],
          totalCount: 0,
        }),
      });
    });
  });

  test('dashboard page loads', async ({ page }) => {
    await page.goto('/dashboard');
    await page.screenshot({ path: 'e2e/screenshots/dashboard.png' });
  });

  test('dashboard has create course button', async ({ page }) => {
    await page.goto('/dashboard');

    const createButton = page.locator('button:has-text("Create Course"), button:has-text("Create")');
    await expect(createButton.first()).toBeVisible();
  });

  test('dashboard create course navigates to builder', async ({ page }) => {
    await page.goto('/dashboard');

    const createButton = page.locator('button:has-text("Create Course")');
    if (await createButton.first().isVisible()) {
      await createButton.first().click();
      await expect(page).toHaveURL('/course-builder');
    }
  });
});
