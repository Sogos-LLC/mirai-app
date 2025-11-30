/**
 * Logout State Machine
 *
 * XState v5 machine for the logout flow. Handles:
 * - Creating Kratos logout flow
 * - Performing logout with Kratos
 * - Clearing session token cookie (fixes the bug where cookie persisted)
 * - Clearing Redux state
 * - Redirecting to landing/marketing page
 *
 * Graceful fallback: If Kratos is unreachable, still clears local session.
 */

import { createMachine, assign, fromPromise } from 'xstate';
import { createLogoutFlow, performLogout } from '@/lib/kratos/client';
import { clearSessionTokenCookie, LANDING_URL } from '@/lib/auth.config';
import type { LogoutFlow } from '@/lib/kratos/types';
import { type AuthError, createAuthError, NetworkError } from './shared/types';
import { logoutTelemetry, AUTH_TELEMETRY, emitTelemetry } from './shared/telemetry';

// =============================================================================
// Types
// =============================================================================

export interface LogoutContext {
  // Logout flow from Kratos
  logoutFlow: LogoutFlow | null;
  logoutToken: string | null;

  // Error handling
  error: AuthError | null;

  // Telemetry
  flowStartedAt: number | null;

  // Track if we cleared local session
  localSessionCleared: boolean;
}

export type LogoutEvent =
  | { type: 'START_LOGOUT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' }
  | { type: 'RETRY' };

// =============================================================================
// Initial Context
// =============================================================================

const initialContext: LogoutContext = {
  logoutFlow: null,
  logoutToken: null,
  error: null,
  flowStartedAt: null,
  localSessionCleared: false,
};

// =============================================================================
// Actors
// =============================================================================

/**
 * Create a logout flow with Kratos
 */
const createLogoutFlowActor = fromPromise<LogoutFlow, void>(async () => {
  try {
    return await createLogoutFlow();
  } catch (error) {
    throw new NetworkError(
      error instanceof Error ? error.message : 'Failed to create logout flow'
    );
  }
});

/**
 * Perform the logout with Kratos
 */
const performLogoutActor = fromPromise<void, { token: string }>(async ({ input }) => {
  try {
    await performLogout(input.token);
  } catch (error) {
    throw new NetworkError(
      error instanceof Error ? error.message : 'Failed to perform logout'
    );
  }
});

/**
 * Clear local session (cookie and localStorage)
 */
const clearLocalSessionActor = fromPromise<void, void>(async () => {
  // Clear the session token cookie - THIS FIXES THE BUG
  clearSessionTokenCookie();

  // Clear localStorage items
  if (typeof window !== 'undefined') {
    const keysToRemove = ['currentCourseState', 'draftCourse'];
    keysToRemove.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore errors
      }
    });
  }
});

// =============================================================================
// Machine
// =============================================================================

export const logoutMachine = createMachine({
  id: 'logout',
  initial: 'idle',
  context: initialContext,
  types: {} as {
    context: LogoutContext;
    events: LogoutEvent;
  },
  states: {
    // --------------------------------------------------------
    // Idle - waiting for logout to start
    // --------------------------------------------------------
    idle: {
      on: {
        START_LOGOUT: {
          target: 'creatingLogoutFlow',
          actions: assign({
            flowStartedAt: () => Date.now(),
            error: null,
            localSessionCleared: false,
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Creating logout flow with Kratos
    // --------------------------------------------------------
    creatingLogoutFlow: {
      entry: logoutTelemetry.started,
      invoke: {
        id: 'createLogoutFlow',
        src: createLogoutFlowActor,
        onDone: {
          target: 'performingLogout',
          actions: assign({
            logoutFlow: ({ event }) => event.output,
            logoutToken: ({ event }) => event.output.logout_token,
          }),
        },
        onError: {
          // Graceful fallback: if Kratos is unreachable, still clear local session
          target: 'clearingSession',
          actions: assign({
            error: createAuthError(
              'NETWORK_ERROR',
              'Could not contact auth server. Clearing local session.',
              false
            ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Performing logout with Kratos
    // --------------------------------------------------------
    performingLogout: {
      invoke: {
        id: 'performLogout',
        src: performLogoutActor,
        input: ({ context }) => ({ token: context.logoutToken! }),
        onDone: {
          target: 'clearingSession',
        },
        onError: {
          // Even if Kratos logout fails, clear local session
          target: 'clearingSession',
          actions: assign({
            error: createAuthError(
              'NETWORK_ERROR',
              'Logout request failed. Clearing local session.',
              false
            ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Clearing local session (cookie, localStorage)
    // --------------------------------------------------------
    clearingSession: {
      invoke: {
        id: 'clearLocalSession',
        src: clearLocalSessionActor,
        onDone: {
          target: 'redirecting',
          actions: assign({
            localSessionCleared: true,
          }),
        },
        onError: {
          // Should never fail, but handle gracefully
          target: 'redirecting',
          actions: assign({
            localSessionCleared: true,
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Redirecting to landing page
    // --------------------------------------------------------
    redirecting: {
      entry: [
        logoutTelemetry.completed,
        ({ context }) => {
          emitTelemetry(AUTH_TELEMETRY.LOGOUT_COMPLETED, {
            machineId: 'logout',
            duration: context.flowStartedAt ? Date.now() - context.flowStartedAt : undefined,
            metadata: {
              hadError: context.error !== null,
              localSessionCleared: context.localSessionCleared,
            },
          });
        },
      ],
      // The hook will handle the actual redirect
      type: 'final',
    },

    // --------------------------------------------------------
    // Complete
    // --------------------------------------------------------
    complete: {
      type: 'final',
    },
  },
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the landing URL for post-logout redirect
 */
export function getLogoutRedirectUrl(): string {
  return LANDING_URL;
}
