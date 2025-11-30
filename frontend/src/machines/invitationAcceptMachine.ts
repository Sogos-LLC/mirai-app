/**
 * Invitation Accept State Machine
 *
 * XState v5 machine for accepting team invitations.
 *
 * Flow:
 * 1. User clicks invitation link with token (/auth/accept-invite?token=xxx)
 * 2. Machine fetches invitation details to show company info
 * 3. Check if user is already authenticated
 * 4. If authenticated with matching email, accept invitation directly
 * 5. If not authenticated, user must register or login first
 * 6. After successful acceptance, redirect to dashboard
 */

import { createMachine, assign, fromPromise } from 'xstate';
import { createClient } from '@connectrpc/connect';
import { transport } from '@/lib/connect';
import { getSession } from '@/lib/kratos/client';
import { REDIRECT_URLS } from '@/lib/auth.config';
import {
  InvitationService,
  InvitationStatus,
  type Invitation,
} from '@/gen/mirai/v1/invitation_pb';
import type { Company, User } from '@/gen/mirai/v1/common_pb';
import {
  type AuthError,
  NetworkError,
  InvitationExpiredError,
  InvitationInvalidError,
  InvitationRevokedError,
  InvitationAlreadyAcceptedError,
  createAuthError,
  toAuthError,
} from './shared/types';
import { invitationTelemetry, AUTH_TELEMETRY, emitTelemetry } from './shared/telemetry';
import { canRetry, MAX_RETRY_COUNT } from './shared/guards';
import type { KratosSession } from '@/lib/kratos/types';

// =============================================================================
// Types
// =============================================================================

export interface InvitationAcceptContext {
  // Token from URL
  token: string | null;

  // Invitation data
  invitation: Invitation | null;
  company: Company | null;

  // Session state
  session: KratosSession | null;
  isAuthenticated: boolean;

  // Result after acceptance
  acceptedUser: User | null;
  acceptedCompany: Company | null;

  // Error handling
  error: AuthError | null;
  retryCount: number;

  // Telemetry
  flowStartedAt: number | null;
}

export type InvitationAcceptEvent =
  | { type: 'START'; token: string }
  | { type: 'RETRY' }
  | { type: 'RESET' }
  | { type: 'GO_TO_REGISTER' }
  | { type: 'GO_TO_LOGIN' }
  | { type: 'SESSION_READY'; session: KratosSession }
  | { type: 'ACCEPT' };

// =============================================================================
// Initial Context
// =============================================================================

const initialContext: InvitationAcceptContext = {
  token: null,
  invitation: null,
  company: null,
  session: null,
  isAuthenticated: false,
  acceptedUser: null,
  acceptedCompany: null,
  error: null,
  retryCount: 0,
  flowStartedAt: null,
};

// =============================================================================
// API Client
// =============================================================================

const invitationClient = createClient(InvitationService, transport);

// =============================================================================
// Actors
// =============================================================================

/**
 * Fetch invitation details by token (public endpoint)
 */
const fetchInvitationActor = fromPromise<
  { invitation: Invitation; company: Company },
  { token: string }
>(async ({ input }) => {
  try {
    const response = await invitationClient.getInvitationByToken({ token: input.token });

    if (!response.invitation || !response.company) {
      throw new InvitationInvalidError('Invitation not found');
    }

    // Check invitation status
    const status = response.invitation.status;
    if (status === InvitationStatus.EXPIRED) {
      throw new InvitationExpiredError('This invitation has expired');
    }
    if (status === InvitationStatus.REVOKED) {
      throw new InvitationRevokedError('This invitation has been revoked');
    }
    if (status === InvitationStatus.ACCEPTED) {
      throw new InvitationAlreadyAcceptedError('This invitation has already been used');
    }

    return {
      invitation: response.invitation,
      company: response.company,
    };
  } catch (error) {
    // Re-throw our custom errors
    if (
      error instanceof InvitationExpiredError ||
      error instanceof InvitationInvalidError ||
      error instanceof InvitationRevokedError ||
      error instanceof InvitationAlreadyAcceptedError
    ) {
      throw error;
    }

    // Check for network/API errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('not found') || message.includes('404')) {
        throw new InvitationInvalidError('Invitation not found');
      }
    }

    throw new NetworkError(
      error instanceof Error ? error.message : 'Failed to fetch invitation'
    );
  }
});

/**
 * Check if user has an active session
 */
const checkSessionActor = fromPromise<KratosSession | null, void>(async () => {
  return getSession();
});

/**
 * Accept the invitation (requires authentication)
 */
const acceptInvitationActor = fromPromise<
  { invitation: Invitation; user: User; company: Company },
  { token: string }
>(async ({ input }) => {
  try {
    const response = await invitationClient.acceptInvitation({ token: input.token });

    if (!response.invitation || !response.user || !response.company) {
      throw new Error('Invalid response from server');
    }

    return {
      invitation: response.invitation,
      user: response.user,
      company: response.company,
    };
  } catch (error) {
    // Check for specific error types from backend
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('expired')) {
        throw new InvitationExpiredError('This invitation has expired');
      }
      if (message.includes('revoked')) {
        throw new InvitationRevokedError('This invitation has been revoked');
      }
      if (message.includes('already accepted') || message.includes('already used')) {
        throw new InvitationAlreadyAcceptedError('This invitation has already been used');
      }
      if (message.includes('email mismatch') || message.includes('unauthorized')) {
        throw new Error('Your email address does not match the invitation');
      }
    }

    throw new NetworkError(
      error instanceof Error ? error.message : 'Failed to accept invitation'
    );
  }
});

// =============================================================================
// Machine
// =============================================================================

export const invitationAcceptMachine = createMachine({
  id: 'invitationAccept',
  initial: 'idle',
  context: initialContext,
  types: {} as {
    context: InvitationAcceptContext;
    events: InvitationAcceptEvent;
  },
  states: {
    // --------------------------------------------------------
    // Idle - waiting to start
    // --------------------------------------------------------
    idle: {
      on: {
        START: {
          target: 'fetchingInvitation',
          actions: assign({
            token: ({ event }) => event.token,
            flowStartedAt: () => Date.now(),
            error: null,
            retryCount: 0,
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Fetching invitation details
    // --------------------------------------------------------
    fetchingInvitation: {
      entry: invitationTelemetry.viewed,
      invoke: {
        id: 'fetchInvitation',
        src: fetchInvitationActor,
        input: ({ context }) => ({ token: context.token! }),
        onDone: {
          target: 'checkingSession',
          actions: assign({
            invitation: ({ event }) => event.output.invitation,
            company: ({ event }) => event.output.company,
            error: null,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => toAuthError(event.error),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Checking if user is authenticated
    // --------------------------------------------------------
    checkingSession: {
      invoke: {
        id: 'checkSession',
        src: checkSessionActor,
        onDone: [
          {
            // User is authenticated - check if email matches
            target: 'authenticated',
            guard: ({ event, context }) => {
              if (!event.output?.active) return false;
              // Check if session email matches invitation email
              const sessionEmail = event.output.identity?.traits?.email;
              return sessionEmail === context.invitation?.email;
            },
            actions: assign({
              session: ({ event }) => event.output,
              isAuthenticated: true,
            }),
          },
          {
            // User is authenticated but email doesn't match
            target: 'emailMismatch',
            guard: ({ event }) => event.output?.active === true,
            actions: assign({
              session: ({ event }) => event.output,
              isAuthenticated: true,
            }),
          },
          {
            // Not authenticated - need to register or login
            target: 'needsAuth',
          },
        ],
        onError: {
          // Session check failed - assume not authenticated
          target: 'needsAuth',
        },
      },
    },

    // --------------------------------------------------------
    // Email mismatch - logged in with different email
    // --------------------------------------------------------
    emailMismatch: {
      // User needs to log out and log in with correct email
      // or create a new account with the invited email
      on: {
        GO_TO_LOGIN: {
          target: 'redirectingToLogin',
        },
        GO_TO_REGISTER: {
          target: 'redirectingToRegister',
        },
        RETRY: {
          target: 'checkingSession',
          guard: canRetry,
          actions: assign({
            retryCount: ({ context }) => context.retryCount + 1,
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Needs authentication
    // --------------------------------------------------------
    needsAuth: {
      on: {
        GO_TO_REGISTER: {
          target: 'redirectingToRegister',
        },
        GO_TO_LOGIN: {
          target: 'redirectingToLogin',
        },
        // Can also receive a session if user logs in in another tab
        SESSION_READY: {
          target: 'checkingSession',
          actions: assign({
            session: ({ event }) => event.session,
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Redirecting to register
    // --------------------------------------------------------
    redirectingToRegister: {
      type: 'final',
      // Component will handle redirect with return_to
    },

    // --------------------------------------------------------
    // Redirecting to login
    // --------------------------------------------------------
    redirectingToLogin: {
      type: 'final',
      // Component will handle redirect with return_to
    },

    // --------------------------------------------------------
    // Authenticated - can accept invitation
    // --------------------------------------------------------
    authenticated: {
      on: {
        ACCEPT: {
          target: 'accepting',
        },
      },
    },

    // --------------------------------------------------------
    // Accepting invitation
    // --------------------------------------------------------
    accepting: {
      invoke: {
        id: 'acceptInvitation',
        src: acceptInvitationActor,
        input: ({ context }) => ({ token: context.token! }),
        onDone: {
          target: 'accepted',
          actions: assign({
            invitation: ({ event }) => event.output.invitation,
            acceptedUser: ({ event }) => event.output.user,
            acceptedCompany: ({ event }) => event.output.company,
            error: null,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => toAuthError(event.error),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Accepted - success!
    // --------------------------------------------------------
    accepted: {
      type: 'final',
      entry: ({ context }) => {
        emitTelemetry(AUTH_TELEMETRY.INVITATION_ACCEPTED, {
          machineId: 'invitationAccept',
          duration: context.flowStartedAt ? Date.now() - context.flowStartedAt : undefined,
          metadata: {
            companyId: context.acceptedCompany?.id,
          },
        });
      },
    },

    // --------------------------------------------------------
    // Error state
    // --------------------------------------------------------
    error: {
      entry: invitationTelemetry.failed,
      on: {
        RETRY: {
          target: 'fetchingInvitation',
          guard: ({ context }) => canRetry({ context }) && context.error?.retryable === true,
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
 * Build the accept invitation URL (for use in emails)
 */
export function buildAcceptInviteUrl(token: string, baseUrl?: string): string {
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${REDIRECT_URLS.ACCEPT_INVITE}?token=${encodeURIComponent(token)}`;
}

/**
 * Build redirect URL to registration with invitation token
 */
export function buildRegistrationWithInviteUrl(token: string): string {
  return `${REDIRECT_URLS.REGISTRATION}?invite_token=${encodeURIComponent(token)}`;
}

/**
 * Build redirect URL to login with return_to for invitation
 */
export function buildLoginWithInviteUrl(token: string): string {
  const returnTo = `${REDIRECT_URLS.ACCEPT_INVITE}?token=${encodeURIComponent(token)}`;
  return `${REDIRECT_URLS.LOGIN}?return_to=${encodeURIComponent(returnTo)}`;
}
