/**
 * Invited User Registration State Machine
 *
 * XState v5 machine for handling invited user registration.
 * This is a simplified flow compared to the full registration wizard.
 *
 * Flow:
 * 1. User clicks invitation link with token
 * 2. Machine fetches invitation details to validate and get email
 * 3. User fills in first name, last name, and password (email pre-filled)
 * 4. Machine submits to RegisterWithInvitation endpoint
 * 5. Session token is set and user is redirected to dashboard
 */

import { createMachine, assign, fromPromise } from 'xstate';
import { createClient } from '@connectrpc/connect';
import { transport } from '@/lib/connect';
import { setSessionTokenCookie, REDIRECT_URLS } from '@/lib/auth.config';
import {
  InvitationService,
  InvitationStatus,
  type Invitation,
} from '@/gen/mirai/v1/invitation_pb';
import {
  AuthService,
  type RegisterWithInvitationResponse,
} from '@/gen/mirai/v1/auth_pb';
import type { Company, User } from '@/gen/mirai/v1/common_pb';
import {
  type AuthError,
  NetworkError,
  InvitationExpiredError,
  InvitationInvalidError,
  InvitationRevokedError,
  InvitationAlreadyAcceptedError,
  toAuthError,
  createAuthError,
} from './shared/types';
import { invitationTelemetry, AUTH_TELEMETRY, emitTelemetry } from './shared/telemetry';

// =============================================================================
// Types
// =============================================================================

export interface InvitedUserContext {
  // Token from URL
  token: string | null;

  // Invitation data
  invitation: Invitation | null;
  company: Company | null;

  // Form data
  firstName: string;
  lastName: string;
  password: string;

  // Result after registration
  user: User | null;
  sessionToken: string | null;

  // Error handling
  error: AuthError | null;
  retryCount: number;

  // Telemetry
  flowStartedAt: number | null;
}

export type InvitedUserEvent =
  | { type: 'START'; token: string }
  | { type: 'SET_FORM'; firstName: string; lastName: string; password: string }
  | { type: 'SUBMIT' }
  | { type: 'RETRY' }
  | { type: 'RESET' };

// =============================================================================
// Initial Context
// =============================================================================

const initialContext: InvitedUserContext = {
  token: null,
  invitation: null,
  company: null,
  firstName: '',
  lastName: '',
  password: '',
  user: null,
  sessionToken: null,
  error: null,
  retryCount: 0,
  flowStartedAt: null,
};

// =============================================================================
// API Clients
// =============================================================================

const invitationClient = createClient(InvitationService, transport);
const authClient = createClient(AuthService, transport);

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
 * Register the invited user
 */
const registerInvitedUserActor = fromPromise<
  RegisterWithInvitationResponse,
  { token: string; firstName: string; lastName: string; password: string }
>(async ({ input }) => {
  try {
    const response = await authClient.registerWithInvitation({
      token: input.token,
      firstName: input.firstName,
      lastName: input.lastName,
      password: input.password,
    });

    if (!response.user || !response.company || !response.sessionToken) {
      throw new Error('Invalid response from server');
    }

    return response;
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
      if (message.includes('email already exists')) {
        throw new NetworkError('An account with this email already exists. Please sign in instead.');
      }
    }

    throw new NetworkError(
      error instanceof Error ? error.message : 'Registration failed'
    );
  }
});

// =============================================================================
// Machine
// =============================================================================

export const invitedUserMachine = createMachine({
  id: 'invitedUser',
  initial: 'idle',
  context: initialContext,
  types: {} as {
    context: InvitedUserContext;
    events: InvitedUserEvent;
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
          target: 'collectingInfo',
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
    // Collecting user information (form state)
    // --------------------------------------------------------
    collectingInfo: {
      on: {
        SET_FORM: {
          actions: assign({
            firstName: ({ event }) => event.firstName,
            lastName: ({ event }) => event.lastName,
            password: ({ event }) => event.password,
            error: null,
          }),
        },
        SUBMIT: {
          target: 'submitting',
          guard: ({ context }) =>
            context.firstName.trim().length > 0 &&
            context.lastName.trim().length > 0 &&
            context.password.length >= 8,
        },
      },
    },

    // --------------------------------------------------------
    // Submitting registration
    // --------------------------------------------------------
    submitting: {
      invoke: {
        id: 'registerInvitedUser',
        src: registerInvitedUserActor,
        input: ({ context }) => ({
          token: context.token!,
          firstName: context.firstName,
          lastName: context.lastName,
          password: context.password,
        }),
        onDone: {
          target: 'settingSession',
          actions: assign({
            user: ({ event }) => event.output.user ?? null,
            sessionToken: ({ event }) => event.output.sessionToken,
            error: null,
          }),
        },
        onError: {
          target: 'collectingInfo',
          actions: assign({
            error: ({ event }) => toAuthError(event.error),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Setting session cookie
    // --------------------------------------------------------
    settingSession: {
      entry: ({ context }) => {
        // Set the session token cookie
        if (context.sessionToken) {
          setSessionTokenCookie(context.sessionToken);
        }
      },
      always: {
        target: 'success',
      },
    },

    // --------------------------------------------------------
    // Success - registration complete!
    // --------------------------------------------------------
    success: {
      type: 'final',
      entry: ({ context }) => {
        emitTelemetry(AUTH_TELEMETRY.INVITATION_ACCEPTED, {
          machineId: 'invitedUser',
          duration: context.flowStartedAt ? Date.now() - context.flowStartedAt : undefined,
          metadata: {
            companyId: context.company?.id,
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
          guard: ({ context }) => context.retryCount < 3 && context.error?.retryable === true,
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
 * Get the dashboard URL with welcome parameter for confetti
 */
export function getWelcomeDashboardUrl(): string {
  return `${REDIRECT_URLS.DASHBOARD}?welcome=true`;
}
