import { test as base, Page } from '@playwright/test';

// Mock user data
export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'admin',
  companyId: 'test-company-id',
  companyName: 'Test Company',
};

// Helper to mock authenticated session
export async function mockAuthenticatedSession(page: Page) {
  // Mock Ory Kratos session endpoint
  await page.route('**/sessions/whoami', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-session-id',
        active: true,
        identity: {
          id: mockUser.id,
          traits: {
            email: mockUser.email,
            name: {
              first: mockUser.firstName,
              last: mockUser.lastName,
            },
          },
        },
      }),
    });
  });

  // Mock the user/me endpoint
  await page.route('**/mirai.v1.UserService/GetMe', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: mockUser,
        company: {
          id: mockUser.companyId,
          name: mockUser.companyName,
        },
      }),
    });
  });
}

// Helper to mock unauthenticated state
export async function mockUnauthenticatedSession(page: Page) {
  await page.route('**/sessions/whoami', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 401, message: 'Unauthorized' } }),
    });
  });
}

// Extended test with auth helpers
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await mockAuthenticatedSession(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
