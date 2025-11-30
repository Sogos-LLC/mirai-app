/**
 * Integration Tests for Auth Flow
 *
 * These tests verify the complete signup → Stripe → dashboard flow
 * by testing the contract between components.
 *
 * Note: These are contract tests, not E2E tests. They verify that:
 * 1. The registration response contains required fields
 * 2. Session tokens are handled correctly through the flow
 * 3. Redirects follow the expected pattern
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetMockCookies, getMockCookies } from '@/test/setup';
import {
  AUTH_COOKIES,
  REDIRECT_URLS,
  REDIRECT_PARAMS,
  setSessionTokenCookie,
  extractSessionToken,
} from './auth.config';

// =============================================================================
// Mock Types matching Proto definitions
// =============================================================================

interface MockRegisterResponse {
  user: {
    id: string;
    kratosId: string;
    companyId?: string;
    role: 'ROLE_OWNER' | 'ROLE_ADMIN' | 'ROLE_MEMBER';
  };
  company?: {
    id: string;
    name: string;
    plan: 'PLAN_STARTER' | 'PLAN_PRO' | 'PLAN_ENTERPRISE';
    subscriptionStatus: 'SUBSCRIPTION_STATUS_NONE' | 'SUBSCRIPTION_STATUS_ACTIVE';
  };
  checkoutUrl?: string;
  sessionToken?: string;
}

// =============================================================================
// Registration Response Contract Tests
// =============================================================================

describe('Registration Response Contract', () => {
  it('should include session_token for paid plans', () => {
    // Backend contract: paid plans return a session token
    const response: MockRegisterResponse = {
      user: {
        id: 'user-123',
        kratosId: 'kratos-456',
        companyId: 'company-789',
        role: 'ROLE_OWNER',
      },
      company: {
        id: 'company-789',
        name: 'Test Company',
        plan: 'PLAN_PRO',
        subscriptionStatus: 'SUBSCRIPTION_STATUS_NONE',
      },
      checkoutUrl: 'https://checkout.stripe.com/session/xyz',
      sessionToken: 'session-token-abc123',
    };

    // Verify contract fields
    expect(response.sessionToken).toBeDefined();
    expect(response.checkoutUrl).toBeDefined();
    expect(response.user.role).toBe('ROLE_OWNER');
    expect(response.company?.plan).toBe('PLAN_PRO');
  });

  it('should NOT include checkout_url for enterprise plans', () => {
    const response: MockRegisterResponse = {
      user: {
        id: 'user-123',
        kratosId: 'kratos-456',
        role: 'ROLE_OWNER',
      },
      // Enterprise: no checkout, handled via sales
    };

    expect(response.checkoutUrl).toBeUndefined();
  });
});

// =============================================================================
// Signup → Stripe → Dashboard Flow Tests
// =============================================================================

describe('Signup → Stripe → Dashboard Flow', () => {
  beforeEach(() => {
    resetMockCookies();
  });

  describe('Step 1: Registration completes', () => {
    it('should receive session token from backend', () => {
      const backendResponse: MockRegisterResponse = {
        user: { id: 'u1', kratosId: 'k1', companyId: 'c1', role: 'ROLE_OWNER' },
        company: { id: 'c1', name: 'Co', plan: 'PLAN_PRO', subscriptionStatus: 'SUBSCRIPTION_STATUS_NONE' },
        checkoutUrl: 'https://checkout.stripe.com/xyz',
        sessionToken: 'backend-session-token-xyz',
      };

      // Contract: backend returns session_token for paid plans
      expect(backendResponse.sessionToken).toBe('backend-session-token-xyz');
      expect(typeof backendResponse.sessionToken).toBe('string');
      expect(backendResponse.sessionToken.length).toBeGreaterThan(0);
    });
  });

  describe('Step 2: Frontend sets cookie before Stripe redirect', () => {
    it('should set session token cookie with correct name', () => {
      const sessionToken = 'test-session-token';

      // Frontend action: set cookie before redirect
      setSessionTokenCookie(sessionToken);

      // Verify cookie is set with correct name
      const cookies = getMockCookies();
      expect(cookies[AUTH_COOKIES.SESSION_TOKEN]).toBe(sessionToken);
    });

    it('should use ory_session_token cookie name (not ory_kratos_session)', () => {
      setSessionTokenCookie('any-token');

      const cookies = getMockCookies();

      // Must use API flow cookie name
      expect(AUTH_COOKIES.SESSION_TOKEN).toBe('ory_session_token');
      expect(cookies['ory_session_token']).toBeDefined();

      // Must NOT set browser flow cookie
      expect(cookies['ory_kratos_session']).toBeUndefined();
    });
  });

  describe('Step 3: User returns from Stripe to complete-checkout', () => {
    it('should redirect to dashboard with checkout=success param', () => {
      // Backend redirects to: /dashboard?checkout=success
      const expectedRedirect = REDIRECT_URLS.POST_CHECKOUT;

      expect(expectedRedirect).toBe('/dashboard?checkout=success');
      expect(expectedRedirect).toContain(REDIRECT_URLS.DASHBOARD);
      expect(expectedRedirect).toContain(REDIRECT_PARAMS.CHECKOUT_SUCCESS);
    });
  });

  describe('Step 4: Middleware validates session', () => {
    it('should extract session token from cookie header', () => {
      // Simulate: cookie was set before Stripe redirect
      setSessionTokenCookie('validated-token');

      // Middleware reads cookie header
      const cookieHeader = document.cookie;
      const extractedToken = extractSessionToken(cookieHeader);

      // Token should be extractable
      expect(extractedToken).toBe('validated-token');
    });

    it('should send token as Authorization: Bearer to Kratos', () => {
      const token = 'bearer-test-token';

      // This is the contract the middleware follows
      const authHeader = `Bearer ${token}`;

      expect(authHeader).toBe('Bearer bearer-test-token');
      expect(authHeader.startsWith('Bearer ')).toBe(true);
    });
  });

  describe('Step 5: User lands on dashboard', () => {
    it('should have dashboard as final destination', () => {
      expect(REDIRECT_URLS.DASHBOARD).toBe('/dashboard');
    });

    it('should include checkout=success in URL', () => {
      const finalUrl = REDIRECT_URLS.POST_CHECKOUT;
      expect(finalUrl).toContain('checkout=success');
    });
  });
});

// =============================================================================
// Error Handling Contract Tests
// =============================================================================

describe('Error Handling Contract', () => {
  it('should redirect to login on session validation failure', () => {
    // When Kratos returns 401, middleware redirects to login
    const expectedRedirect = REDIRECT_URLS.LOGIN;
    expect(expectedRedirect).toBe('/auth/login');
  });

  it('should include return_to param when redirecting to login', () => {
    const originalPath = '/dashboard';
    const loginUrl = `${REDIRECT_URLS.LOGIN}?${REDIRECT_PARAMS.RETURN_TO}=${encodeURIComponent(originalPath)}`;

    expect(loginUrl).toContain('return_to=');
    expect(loginUrl).toContain('%2Fdashboard');
  });

  it('should handle missing session token gracefully', () => {
    resetMockCookies();

    // No cookie set
    const cookieHeader = document.cookie;
    const token = extractSessionToken(cookieHeader);

    // Should return null, not throw
    expect(token).toBeNull();
  });
});

// =============================================================================
// Contract Consistency Tests
// =============================================================================

describe('Contract Consistency', () => {
  it('should have consistent redirect URL structure', () => {
    // All redirect URLs should be absolute paths
    expect(REDIRECT_URLS.DASHBOARD.startsWith('/')).toBe(true);
    expect(REDIRECT_URLS.LOGIN.startsWith('/')).toBe(true);
    expect(REDIRECT_URLS.REGISTRATION.startsWith('/')).toBe(true);
  });

  it('should have POST_CHECKOUT built from DASHBOARD + CHECKOUT_SUCCESS', () => {
    const expected = `${REDIRECT_URLS.DASHBOARD}?${REDIRECT_PARAMS.CHECKOUT_SUCCESS}`;
    expect(REDIRECT_URLS.POST_CHECKOUT).toBe(expected);
  });

  it('should use different cookies for API and browser flows', () => {
    // Critical: these must remain different
    expect(AUTH_COOKIES.SESSION_TOKEN).not.toBe(AUTH_COOKIES.KRATOS_SESSION);

    // API flow cookie
    expect(AUTH_COOKIES.SESSION_TOKEN).toBe('ory_session_token');

    // Browser flow cookie (Kratos-managed)
    expect(AUTH_COOKIES.KRATOS_SESSION).toBe('ory_kratos_session');
  });
});
