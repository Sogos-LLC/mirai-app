import '@testing-library/jest-dom';

// Mock document.cookie for tests
let mockCookies: Record<string, string> = {};

Object.defineProperty(document, 'cookie', {
  get: () => {
    return Object.entries(mockCookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  },
  set: (cookieString: string) => {
    // Handle cookie deletion (expires in past)
    if (cookieString.includes('expires=Thu, 01 Jan 1970')) {
      const name = cookieString.split('=')[0];
      delete mockCookies[name];
      return;
    }

    // Parse and store cookie
    const [nameValue] = cookieString.split(';');
    const [name, value] = nameValue.split('=');
    if (name && value !== undefined) {
      mockCookies[name.trim()] = value.trim();
    }
  },
});

// Helper to reset cookies between tests
export function resetMockCookies() {
  mockCookies = {};
}

// Helper to set mock cookies directly
export function setMockCookie(name: string, value: string) {
  mockCookies[name] = value;
}

// Helper to get current mock cookies
export function getMockCookies() {
  return { ...mockCookies };
}
