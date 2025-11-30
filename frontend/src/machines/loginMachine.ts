/**
 * Login State Machine
 *
 * XState v5 machine for the login flow. Wraps Kratos browser flow
 * with proper state management, error handling, and telemetry.
 *
 * Flow: The actual form submission goes directly to Kratos (browser flow).
 * This machine handles:
 * - Session checking (redirect if already logged in)
 * - Flow initialization and retrieval
 * - Flow expiration handling
 * - Error states with retry capability
 * - Telemetry
 */

import { createMachine, assign, fromPromise } from 'xstate';
import { getLoginFlow, getKratosBrowserUrl } from '@/lib/kratos/client';
import { REDIRECT_URLS } from '@/lib/auth.config';
import type { LoginFlow } from '@/lib/kratos/types';
import {
  type AuthError,
  FlowExpiredError,
  NetworkError,
  createAuthError,
  toAuthError,
} from './shared/types';
import { loginTelemetry, AUTH_TELEMETRY, emitTelemetry } from './shared/telemetry';
import { canRetry, MAX_RETRY_COUNT } from './shared/guards';

// =============================================================================
// Types
// =============================================================================

export interface LoginContext {
  // Flow state
  flow: LoginFlow | null;
  flowId: string | null;

  // URL parameters
  returnTo: string | null;

  // Error handling
  error: AuthError | null;
  retryCount: number;

  // Telemetry
  flowStartedAt: number | null;

  // Checkout success flag (from Stripe redirect)
  checkoutSuccess: boolean;
}

export type LoginEvent =
  | { type: 'START'; flowId?: string; returnTo?: string; checkoutSuccess?: boolean }
  | { type: 'RETRY' }
  | { type: 'RESET' }
  | { type: 'REDIRECT_TO_KRATOS' };

// =============================================================================
// Initial Context
// =============================================================================

const initialContext: LoginContext = {
  flow: null,
  flowId: null,
  returnTo: null,
  error: null,
  retryCount: 0,
  flowStartedAt: null,
  checkoutSuccess: false,
};

// =============================================================================
// Actors
// =============================================================================

/**
 * Fetch existing login flow by ID
 */
const getFlowActor = fromPromise<LoginFlow, { flowId: string }>(async ({ input }) => {
  try {
    return await getLoginFlow(input.flowId);
  } catch (error) {
    // Check for expired/invalid flow
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('410') ||
        message.includes('gone') ||
        message.includes('expired') ||
        message.includes('404') ||
        message.includes('not found')
      ) {
        throw new FlowExpiredError('Login flow has expired');
      }
    }
    throw new NetworkError(error instanceof Error ? error.message : 'Failed to get login flow');
  }
});

// =============================================================================
// Machine
// =============================================================================

export const loginMachine = createMachine({
  id: 'login',
  initial: 'idle',
  context: initialContext,
  types: {} as {
    context: LoginContext;
    events: LoginEvent;
  },
  states: {
    // --------------------------------------------------------
    // Idle - waiting to start
    // Note: Session check is handled by middleware, which redirects
    // authenticated users away from login page. No need to check here.
    // --------------------------------------------------------
    idle: {
      on: {
        START: {
          target: 'checkingFlow',
          actions: [
            loginTelemetry.started,
            assign({
              flowId: ({ event }) => event.flowId || null,
              returnTo: ({ event }) => event.returnTo || null,
              checkoutSuccess: ({ event }) => event.checkoutSuccess || false,
              flowStartedAt: () => Date.now(),
              error: null,
              retryCount: 0,
            }),
          ],
        },
      },
    },

    // --------------------------------------------------------
    // Check if we have a flow ID to fetch
    // --------------------------------------------------------
    checkingFlow: {
      always: [
        {
          // No flow ID - need to redirect to Kratos
          target: 'needsKratosRedirect',
          guard: ({ context }) => !context.flowId,
        },
        {
          // Have flow ID - fetch it
          target: 'fetchingFlow',
        },
      ],
    },

    // --------------------------------------------------------
    // Need to redirect to Kratos to create flow
    // --------------------------------------------------------
    needsKratosRedirect: {
      type: 'final',
      // The component will handle the redirect to Kratos
    },

    // --------------------------------------------------------
    // Fetching existing flow
    // --------------------------------------------------------
    fetchingFlow: {
      invoke: {
        id: 'getFlow',
        src: getFlowActor,
        input: ({ context }) => ({ flowId: context.flowId! }),
        onDone: {
          target: 'ready',
          actions: assign({
            flow: ({ event }) => event.output,
            error: null,
          }),
        },
        onError: [
          {
            // Flow expired - need fresh flow
            target: 'flowExpired',
            guard: ({ event }) => event.error instanceof FlowExpiredError,
            actions: assign({
              error: createAuthError('FLOW_EXPIRED', 'Login session expired', true),
            }),
          },
          {
            // Other error
            target: 'error',
            actions: assign({
              error: ({ event }) => toAuthError(event.error),
            }),
          },
        ],
      },
    },

    // --------------------------------------------------------
    // Flow expired - need to redirect for fresh flow
    // --------------------------------------------------------
    flowExpired: {
      entry: ({ context }) => {
        emitTelemetry(AUTH_TELEMETRY.FLOW_EXPIRED, {
          machineId: 'login',
          duration: context.flowStartedAt ? Date.now() - context.flowStartedAt : undefined,
        });
      },
      // Will redirect to Kratos for fresh flow
      type: 'final',
    },

    // --------------------------------------------------------
    // Ready - flow loaded, showing form
    // --------------------------------------------------------
    ready: {
      // The KratosForm will handle form submission directly to Kratos
      // After successful login, Kratos redirects to return_to or /dashboard
      on: {
        RETRY: {
          target: 'fetchingFlow',
          guard: canRetry,
          actions: assign({
            retryCount: ({ context }) => context.retryCount + 1,
            error: null,
          }),
        },
        RESET: {
          target: 'idle',
          actions: assign(initialContext),
        },
      },
    },

    // --------------------------------------------------------
    // Error state
    // --------------------------------------------------------
    error: {
      entry: loginTelemetry.failed,
      on: {
        RETRY: {
          target: 'checkingFlow',
          guard: canRetry,
          actions: assign({
            retryCount: ({ context }) => context.retryCount + 1,
            error: null,
          }),
        },
        RESET: {
          target: 'idle',
          actions: assign(initialContext),
        },
      },
    },
  },
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build the Kratos login browser URL for redirect
 */
export function buildKratosLoginUrl(returnTo?: string): string {
  const kratosUrl = getKratosBrowserUrl();
  const params = new URLSearchParams();
  if (returnTo) {
    params.set('return_to', returnTo);
  }
  const query = params.toString();
  return `${kratosUrl}/self-service/login/browser${query ? `?${query}` : ''}`;
}

/**
 * Get the redirect destination after login
 */
export function getLoginRedirectUrl(returnTo?: string | null): string {
  return returnTo || REDIRECT_URLS.DASHBOARD;
}
