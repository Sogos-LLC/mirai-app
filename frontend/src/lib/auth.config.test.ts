/**
 * Unit Tests for Auth Configuration
 *
 * These tests lock in the auth contract defined in auth.config.ts.
 * Any changes to cookie names, attributes, or helper behavior will break these tests,
 * ensuring the contract is maintained across the codebase.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockCookies, getMockCookies, setMockCookie } from '@/test/setup';
import {
  AUTH_COOKIES,
  SESSION_COOKIE_ATTRIBUTES,
  REDIRECT_PARAMS,
  REDIRECT_URLS,
  PROTECTED_ROUTES,
  PUBLIC_ROUTES,
  KRATOS_ENDPOINTS,
  setSessionTokenCookie,
  clearSessionTokenCookie,
  getSessionTokenFromCookies,
  extractSessionToken,
  isProtectedRoute,
  isPublicRoute,
  buildLoginRedirect,
} from './auth.config';

// =============================================================================
// Contract Constants Tests - Lock in exact values
// =============================================================================

describe('Auth Contract Constants', () => {
  describe('AUTH_COOKIES', () => {
    it('should have correct session token cookie name', () => {
      // This is the cookie name used for API flow sessions
      // Middleware reads this and sends as Authorization: Bearer
      expect(AUTH_COOKIES.SESSION_TOKEN).toBe('ory_session_token');
    });

    it('should have correct Kratos session cookie name', () => {
      // This is the cookie name Kratos uses for browser flow sessions
      expect(AUTH_COOKIES.KRATOS_SESSION).toBe('ory_kratos_session');
    });

    it('should differentiate API flow from browser flow cookies', () => {
      // Critical: these must be different to support both flows
      expect(AUTH_COOKIES.SESSION_TOKEN).not.toBe(AUTH_COOKIES.KRATOS_SESSION);
    });
  });

  describe('SESSION_COOKIE_ATTRIBUTES', () => {
    it('should set path to root', () => {
      expect(SESSION_COOKIE_ATTRIBUTES.path).toBe('/');
    });

    it('should use SameSite=Lax for cross-site redirect support', () => {
      // SameSite=Lax allows cookie to be sent on redirects from Stripe
      expect(SESSION_COOKIE_ATTRIBUTES.sameSite).toBe('Lax');
    });
  });

  describe('REDIRECT_PARAMS', () => {
    it('should have checkout success param', () => {
      expect(REDIRECT_PARAMS.CHECKOUT_SUCCESS).toBe('checkout=success');
    });

    it('should have checkout canceled param', () => {
      expect(REDIRECT_PARAMS.CHECKOUT_CANCELED).toBe('checkout=canceled');
    });

    it('should have return_to param', () => {
      expect(REDIRECT_PARAMS.RETURN_TO).toBe('return_to');
    });
  });

  describe('REDIRECT_URLS', () => {
    it('should have dashboard URL', () => {
      expect(REDIRECT_URLS.DASHBOARD).toBe('/dashboard');
    });

    it('should have login URL', () => {
      expect(REDIRECT_URLS.LOGIN).toBe('/auth/login');
    });

    it('should have registration URL', () => {
      expect(REDIRECT_URLS.REGISTRATION).toBe('/auth/registration');
    });

    it('should have post-checkout URL with success param', () => {
      expect(REDIRECT_URLS.POST_CHECKOUT).toBe('/dashboard?checkout=success');
    });
  });

  describe('KRATOS_ENDPOINTS', () => {
    it('should have whoami endpoint', () => {
      expect(KRATOS_ENDPOINTS.WHOAMI).toBe('/sessions/whoami');
    });

    it('should have login API endpoint', () => {
      expect(KRATOS_ENDPOINTS.LOGIN_API).toBe('/self-service/login/api');
    });

    it('should have login browser endpoint', () => {
      expect(KRATOS_ENDPOINTS.LOGIN_BROWSER).toBe('/self-service/login/browser');
    });
  });

  describe('PROTECTED_ROUTES', () => {
    it('should include dashboard', () => {
      expect(PROTECTED_ROUTES).toContain('/dashboard');
    });

    it('should include settings', () => {
      expect(PROTECTED_ROUTES).toContain('/settings');
    });

    it('should include course-builder', () => {
      expect(PROTECTED_ROUTES).toContain('/course-builder');
    });
  });

  describe('PUBLIC_ROUTES', () => {
    it('should include login', () => {
      expect(PUBLIC_ROUTES).toContain('/auth/login');
    });

    it('should include registration', () => {
      expect(PUBLIC_ROUTES).toContain('/auth/registration');
    });

    it('should include recovery', () => {
      expect(PUBLIC_ROUTES).toContain('/auth/recovery');
    });
  });
});

// =============================================================================
// Helper Function Tests - Lock in behavior
// =============================================================================

describe('Auth Helper Functions', () => {
  beforeEach(() => {
    resetMockCookies();
  });

  describe('extractSessionToken', () => {
    it('should extract session token from cookie string', () => {
      const cookieString = 'ory_session_token=abc123xyz; other_cookie=value';
      const token = extractSessionToken(cookieString);
      expect(token).toBe('abc123xyz');
    });

    it('should return null when session token cookie is not present', () => {
      const cookieString = 'other_cookie=value; another=test';
      const token = extractSessionToken(cookieString);
      expect(token).toBeNull();
    });

    it('should return null for empty cookie string', () => {
      const token = extractSessionToken('');
      expect(token).toBeNull();
    });

    it('should handle session token at end of string', () => {
      const cookieString = 'other=value; ory_session_token=mytoken';
      const token = extractSessionToken(cookieString);
      expect(token).toBe('mytoken');
    });

    it('should handle session token as only cookie', () => {
      const cookieString = 'ory_session_token=singletoken';
      const token = extractSessionToken(cookieString);
      expect(token).toBe('singletoken');
    });

    it('should NOT extract from ory_kratos_session cookie', () => {
      // Important: API tokens come from ory_session_token, not ory_kratos_session
      const cookieString = 'ory_kratos_session=browsertoken; other=value';
      const token = extractSessionToken(cookieString);
      expect(token).toBeNull();
    });

    it('should handle tokens with special characters', () => {
      const cookieString = 'ory_session_token=abc-123_xyz.456';
      const token = extractSessionToken(cookieString);
      expect(token).toBe('abc-123_xyz.456');
    });
  });

  describe('setSessionTokenCookie', () => {
    it('should set cookie with correct name', () => {
      setSessionTokenCookie('test-token-123');
      const cookies = getMockCookies();
      expect(cookies['ory_session_token']).toBe('test-token-123');
    });

    it('should overwrite existing token', () => {
      setSessionTokenCookie('first-token');
      setSessionTokenCookie('second-token');
      const cookies = getMockCookies();
      expect(cookies['ory_session_token']).toBe('second-token');
    });
  });

  describe('clearSessionTokenCookie', () => {
    it('should remove the session token cookie', () => {
      setMockCookie('ory_session_token', 'token-to-clear');
      expect(getMockCookies()['ory_session_token']).toBe('token-to-clear');

      clearSessionTokenCookie();
      expect(getMockCookies()['ory_session_token']).toBeUndefined();
    });
  });

  describe('getSessionTokenFromCookies', () => {
    it('should get session token from document.cookie', () => {
      setMockCookie('ory_session_token', 'client-side-token');
      const token = getSessionTokenFromCookies();
      expect(token).toBe('client-side-token');
    });

    it('should return null when no session token exists', () => {
      const token = getSessionTokenFromCookies();
      expect(token).toBeNull();
    });
  });

  describe('isProtectedRoute', () => {
    it('should return true for dashboard', () => {
      expect(isProtectedRoute('/dashboard')).toBe(true);
    });

    it('should return true for dashboard subpaths', () => {
      expect(isProtectedRoute('/dashboard/overview')).toBe(true);
    });

    it('should return true for settings', () => {
      expect(isProtectedRoute('/settings')).toBe(true);
    });

    it('should return true for course-builder', () => {
      expect(isProtectedRoute('/course-builder')).toBe(true);
    });

    it('should return true for folder routes', () => {
      expect(isProtectedRoute('/folder/team-1')).toBe(true);
    });

    it('should return false for login', () => {
      expect(isProtectedRoute('/auth/login')).toBe(false);
    });

    it('should return false for registration', () => {
      expect(isProtectedRoute('/auth/registration')).toBe(false);
    });

    it('should return false for root', () => {
      expect(isProtectedRoute('/')).toBe(false);
    });
  });

  describe('isPublicRoute', () => {
    it('should return true for login', () => {
      expect(isPublicRoute('/auth/login')).toBe(true);
    });

    it('should return true for registration', () => {
      expect(isPublicRoute('/auth/registration')).toBe(true);
    });

    it('should return true for recovery', () => {
      expect(isPublicRoute('/auth/recovery')).toBe(true);
    });

    it('should return true for pricing', () => {
      expect(isPublicRoute('/pricing')).toBe(true);
    });

    it('should return false for dashboard', () => {
      expect(isPublicRoute('/dashboard')).toBe(false);
    });

    it('should return false for settings', () => {
      expect(isPublicRoute('/settings')).toBe(false);
    });
  });

  describe('buildLoginRedirect', () => {
    it('should build login URL with return_to parameter', () => {
      const url = buildLoginRedirect('/dashboard');
      expect(url).toBe('/auth/login?return_to=%2Fdashboard');
    });

    it('should encode special characters in return path', () => {
      const url = buildLoginRedirect('/folder/team-1?tab=members');
      expect(url).toContain('return_to=');
      expect(url).toContain('%2F'); // encoded /
    });
  });
});

// =============================================================================
// Integration Contract Tests - Ensure components work together
// =============================================================================

describe('Auth Contract Integration', () => {
  beforeEach(() => {
    resetMockCookies();
  });

  it('should set and extract session token consistently', () => {
    // Simulates: Registration sets token → Middleware extracts token
    const originalToken = 'integration-test-token-abc123';

    // Frontend sets the token (during registration)
    setSessionTokenCookie(originalToken);

    // Middleware extracts from cookie header (simulated)
    const cookieHeader = document.cookie;
    const extractedToken = extractSessionToken(cookieHeader);

    expect(extractedToken).toBe(originalToken);
  });

  it('should handle logout flow correctly', () => {
    // Set token
    setSessionTokenCookie('logout-test-token');
    expect(getSessionTokenFromCookies()).toBe('logout-test-token');

    // Clear on logout
    clearSessionTokenCookie();
    expect(getSessionTokenFromCookies()).toBeNull();
  });

  it('should not confuse API tokens with browser session cookies', () => {
    // Set both cookie types (simulating a user who has logged in both ways)
    setMockCookie('ory_session_token', 'api-flow-token');
    setMockCookie('ory_kratos_session', 'browser-flow-base64-encoded-session');

    const cookieHeader = document.cookie;

    // extractSessionToken should only get the API token
    const apiToken = extractSessionToken(cookieHeader);
    expect(apiToken).toBe('api-flow-token');

    // The browser session cookie should remain untouched
    expect(cookieHeader).toContain('ory_kratos_session=browser-flow-base64-encoded-session');
  });

  describe('Post-checkout redirect contract', () => {
    it('should have matching URL and param values', () => {
      // Ensure POST_CHECKOUT URL contains CHECKOUT_SUCCESS param
      expect(REDIRECT_URLS.POST_CHECKOUT).toContain('checkout=success');
      expect(REDIRECT_URLS.POST_CHECKOUT).toBe(
        `${REDIRECT_URLS.DASHBOARD}?${REDIRECT_PARAMS.CHECKOUT_SUCCESS}`
      );
    });
  });
});
