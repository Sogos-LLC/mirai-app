/**
 * Central Auth Configuration
 *
 * This file is the SINGLE SOURCE OF TRUTH for all authentication-related
 * configuration in the frontend. All auth-related code MUST import from here.
 *
 * Contract:
 * - API flows use session tokens (Authorization: Bearer)
 * - Browser flows use ory_kratos_session cookie (Kratos-managed)
 * - Our app primarily uses API flow for registration/login
 * - Kratos browser UI (forgot-password, etc.) uses browser flow
 */

// =============================================================================
// Session Configuration
// =============================================================================

/**
 * Session modes supported by the application
 * - API: Session token sent via Authorization: Bearer header
 * - Browser: Session cookie managed by Kratos (ory_kratos_session)
 */
export type SessionMode = 'api' | 'browser';

/**
 * Cookie names used for authentication
 */
export const AUTH_COOKIES = {
  /**
   * Our custom cookie for storing API flow session tokens.
   * The middleware reads this and sends it as Authorization: Bearer to Kratos.
   */
  SESSION_TOKEN: 'ory_session_token',

  /**
   * Kratos-managed cookie for browser flows.
   * Set automatically by Kratos during browser-based login/registration.
   * We forward this as Cookie header to Kratos /sessions/whoami.
   */
  KRATOS_SESSION: 'ory_kratos_session',
} as const;

/**
 * Cookie attributes for session token
 */
export const SESSION_COOKIE_ATTRIBUTES = {
  path: '/',
  sameSite: 'Lax' as const,
  // Domain allows cookie to be sent to all subdomains (mirai.sogos.io, mirai-api.sogos.io)
  // In local dev (localhost), we don't set domain so it works on localhost
  domain: typeof window !== 'undefined' && !window.location.hostname.includes('localhost')
    ? '.sogos.io'
    : undefined,
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
} as const;

// =============================================================================
// Redirect Configuration
// =============================================================================

/**
 * Query parameters used in redirects
 */
export const REDIRECT_PARAMS = {
  /** Checkout completed successfully */
  CHECKOUT_SUCCESS: 'checkout=success',
  /** Checkout was canceled */
  CHECKOUT_CANCELED: 'checkout=canceled',
  /** Onboarding completed */
  ONBOARDING_COMPLETE: 'onboarding=complete',
  /** Return URL after auth */
  RETURN_TO: 'return_to',
  /** Error parameter */
  ERROR: 'error',
} as const;

/**
 * Post-auth redirect destinations
 */
export const REDIRECT_URLS = {
  /** Main dashboard after successful auth */
  DASHBOARD: '/dashboard',
  /** Login page */
  LOGIN: '/auth/login',
  /** Registration page */
  REGISTRATION: '/auth/registration',
  /** After checkout success, redirect here with query param */
  POST_CHECKOUT: '/dashboard?checkout=success',
  /** Accept invitation page */
  ACCEPT_INVITE: '/auth/accept-invite',
} as const;

/**
 * External URLs
 */
export const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL || 'https://get-mirai.sogos.io';

// =============================================================================
// Protected Routes
// =============================================================================

/**
 * Routes that require authentication
 */
export const PROTECTED_ROUTES = [
  '/dashboard',
  '/course-builder',
  '/content-library',
  '/templates',
  '/tutorials',
  '/settings',
  '/help',
  '/updates',
  '/folder',
] as const;

/**
 * Routes that are public (don't require auth)
 */
export const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/registration',
  '/auth/recovery',
  '/auth/verification',
  '/auth/error',
  '/auth/accept-invite',
  '/pricing',
] as const;

// =============================================================================
// Kratos Endpoints
// =============================================================================

/**
 * Kratos API endpoints used by the frontend
 */
export const KRATOS_ENDPOINTS = {
  /** Check current session */
  WHOAMI: '/sessions/whoami',
  /** Browser login flow init */
  LOGIN_BROWSER: '/self-service/login/browser',
  /** API login flow init */
  LOGIN_API: '/self-service/login/api',
  /** Browser registration flow init */
  REGISTRATION_BROWSER: '/self-service/registration/browser',
  /** API registration flow init */
  REGISTRATION_API: '/self-service/registration/api',
  /** Logout */
  LOGOUT: '/self-service/logout',
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Set the session token cookie
 * Used after API-based login/registration
 */
export function setSessionTokenCookie(token: string): void {
  const { path, sameSite, domain, secure } = SESSION_COOKIE_ATTRIBUTES;
  let cookie = `${AUTH_COOKIES.SESSION_TOKEN}=${token}; path=${path}; SameSite=${sameSite}`;
  if (domain) {
    cookie += `; domain=${domain}`;
  }
  if (secure) {
    cookie += '; Secure';
  }
  document.cookie = cookie;
}

/**
 * Clear the session token cookie
 * Used during logout
 */
export function clearSessionTokenCookie(): void {
  const { domain } = SESSION_COOKIE_ATTRIBUTES;
  let cookie = `${AUTH_COOKIES.SESSION_TOKEN}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  if (domain) {
    cookie += `; domain=${domain}`;
  }
  document.cookie = cookie;
}

/**
 * Get session token from cookies (client-side)
 */
export function getSessionTokenFromCookies(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`${AUTH_COOKIES.SESSION_TOKEN}=([^;]+)`));
  return match ? match[1] : null;
}

/**
 * Extract session token from cookie string (server-side/middleware)
 */
export function extractSessionToken(cookieString: string): string | null {
  const match = cookieString.match(new RegExp(`${AUTH_COOKIES.SESSION_TOKEN}=([^;]+)`));
  return match ? match[1] : null;
}

/**
 * Check if a path is protected
 */
export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((pattern) => {
    if (pattern.endsWith('/*')) {
      return pathname.startsWith(pattern.slice(0, -2));
    }
    return pathname === pattern || pathname.startsWith(`${pattern}/`);
  });
}

/**
 * Check if a path is public
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((pattern) => {
    if (pattern.endsWith('/*')) {
      return pathname.startsWith(pattern.slice(0, -2));
    }
    return pathname === pattern || pathname.startsWith(`${pattern}/`);
  });
}

/**
 * Build redirect URL with return_to parameter
 */
export function buildLoginRedirect(returnTo: string): string {
  const loginUrl = new URL(REDIRECT_URLS.LOGIN, 'http://placeholder');
  loginUrl.searchParams.set(REDIRECT_PARAMS.RETURN_TO, returnTo);
  return `${loginUrl.pathname}${loginUrl.search}`;
}
