/**
 * Shared Actors for State Machines
 *
 * Common side-effect actors used across all authentication and
 * organization state machines. Actors are defined using XState v5
 * fromPromise pattern.
 *
 * Contract: All actors use auth.config.ts helpers for session management.
 */

import { fromPromise } from 'xstate';
import {
  setSessionTokenCookie,
  clearSessionTokenCookie,
  LANDING_URL,
  REDIRECT_URLS,
} from '@/lib/auth.config';
import { getSession } from '@/lib/kratos/client';
import type { KratosSession } from '@/lib/kratos/types';
import { NetworkError, SessionExpiredError } from './types';

// =============================================================================
// Session Token Actors
// =============================================================================

/**
 * Set the session token cookie
 * Used after successful login/registration
 */
export const setSessionTokenActor = fromPromise<void, { token: string }>(async ({ input }) => {
  setSessionTokenCookie(input.token);
});

/**
 * Clear the session token cookie
 * Used during logout
 */
export const clearSessionTokenActor = fromPromise<void, void>(async () => {
  clearSessionTokenCookie();
});

// =============================================================================
// Session Validation Actors
// =============================================================================

/**
 * Validate current session with Kratos
 * Returns the active session or throws if invalid
 */
export const validateSessionActor = fromPromise<KratosSession, void>(async () => {
  const session = await getSession();

  if (!session) {
    throw new SessionExpiredError('No active session');
  }

  if (!session.active) {
    throw new SessionExpiredError('Session is not active');
  }

  return session;
});

// =============================================================================
// Redirect Actors
// =============================================================================

/**
 * Redirect to a URL
 * Uses window.location for full page navigation
 */
export const redirectActor = fromPromise<void, { url: string; replace?: boolean }>(
  async ({ input }) => {
    const { url, replace = false } = input;

    if (replace) {
      window.location.replace(url);
    } else {
      window.location.href = url;
    }

    // Return a promise that never resolves since we're navigating away
    return new Promise(() => {});
  }
);

/**
 * Redirect to the landing/marketing page
 * Used after logout
 */
export const redirectToLandingActor = fromPromise<void, void>(async () => {
  window.location.href = LANDING_URL;
  return new Promise(() => {});
});

/**
 * Redirect to the dashboard
 * Used after successful login/registration
 */
export const redirectToDashboardActor = fromPromise<void, { returnTo?: string }>(
  async ({ input }) => {
    const destination = input.returnTo || REDIRECT_URLS.DASHBOARD;
    window.location.href = destination;
    return new Promise(() => {});
  }
);

/**
 * Redirect to login page
 * Used when session is invalid
 */
export const redirectToLoginActor = fromPromise<void, { returnTo?: string }>(async ({ input }) => {
  let url = REDIRECT_URLS.LOGIN;
  if (input.returnTo) {
    url += `?return_to=${encodeURIComponent(input.returnTo)}`;
  }
  window.location.href = url;
  return new Promise(() => {});
});

// =============================================================================
// Storage Actors
// =============================================================================

/**
 * Clear all local storage related to the app
 * Used during logout for complete cleanup
 */
export const clearLocalStorageActor = fromPromise<void, void>(async () => {
  if (typeof window === 'undefined') return;

  // Clear specific keys we know about
  const keysToRemove = ['currentCourseState', 'draftCourse'];

  keysToRemove.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore errors (e.g., in SSR or when localStorage is blocked)
    }
  });
});

// =============================================================================
// Utility Actors
// =============================================================================

/**
 * Delay actor for testing or debouncing
 */
export const delayActor = fromPromise<void, { ms: number }>(async ({ input }) => {
  await new Promise((resolve) => setTimeout(resolve, input.ms));
});

/**
 * No-op actor that completes immediately
 * Useful for conditional invocations
 */
export const noopActor = fromPromise<void, void>(async () => {
  // Intentionally empty
});
