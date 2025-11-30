import { createMachine, assign, fromPromise } from 'xstate';
import { checkEmail, register, submitEnterpriseContact } from '@/lib/authClient';
import { Plan } from '@/gen/mirai/v1/common_pb';
import {
  type AuthError,
  createAuthError,
  NetworkError,
} from './shared/types';
import { registrationTelemetry, AUTH_TELEMETRY, emitTelemetry } from './shared/telemetry';
import { canRetry, MAX_RETRY_COUNT } from './shared/guards';

// ============================================================
// Types
// ============================================================

export interface RegistrationContext {
  // Form data
  email: string;
  companyName: string;
  industry: string;
  teamSize: string;
  firstName: string;
  lastName: string;
  password: string;
  plan: Plan;
  seatCount: number;

  // State tracking
  error: AuthError | null;
  checkoutUrl: string | null;
  sessionToken: string | null;
  emailExists: boolean;

  // Retry and telemetry
  retryCount: number;
  flowStartedAt: number | null;
}

export type RegistrationEvent =
  | { type: 'START' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SET_EMAIL'; email: string }
  | { type: 'SET_ORG'; companyName: string; industry?: string; teamSize?: string }
  | { type: 'SET_ACCOUNT'; firstName: string; lastName: string; password: string }
  | { type: 'SET_PLAN'; plan: Plan; seatCount: number }
  | { type: 'SUBMIT' }
  | { type: 'SELECT_ENTERPRISE' }
  | { type: 'CANCEL_ENTERPRISE' }
  | { type: 'RETRY' }
  | { type: 'RESET' };

// API response types
interface CheckEmailResponse {
  exists: boolean;
}

interface RegisterResponse {
  user: { id: string };
  company?: { id: string };
  checkout_url?: string;
  session_token?: string;
}

// ============================================================
// Initial Context
// ============================================================

const initialContext: RegistrationContext = {
  email: '',
  companyName: '',
  industry: '',
  teamSize: '',
  firstName: '',
  lastName: '',
  password: '',
  plan: Plan.STARTER,
  seatCount: 1,
  error: null,
  checkoutUrl: null,
  sessionToken: null,
  emailExists: false,
  retryCount: 0,
  flowStartedAt: null,
};

// ============================================================
// Actor Definitions (XState v5 uses fromPromise)
// ============================================================

const checkEmailActor = fromPromise<CheckEmailResponse, { email: string }>(
  async ({ input }) => {
    try {
      return await checkEmail(input.email);
    } catch (error) {
      throw new NetworkError(
        error instanceof Error ? error.message : 'Failed to check email'
      );
    }
  }
);

const submitRegistrationActor = fromPromise<RegisterResponse, RegistrationContext>(
  async ({ input }) => {
    try {
      return await register({
        email: input.email,
        password: input.password,
        firstName: input.firstName,
        lastName: input.lastName,
        companyName: input.companyName,
        industry: input.industry || undefined,
        teamSize: input.teamSize || undefined,
        plan: input.plan,
        seatCount: input.seatCount,
      });
    } catch (error) {
      throw new NetworkError(
        error instanceof Error ? error.message : 'Registration failed'
      );
    }
  }
);

const submitEnterpriseActor = fromPromise<{ success: boolean }, RegistrationContext>(
  async ({ input }) => {
    try {
      return await submitEnterpriseContact({
        companyName: input.companyName,
        industry: input.industry || undefined,
        teamSize: input.teamSize || undefined,
        name: `${input.firstName} ${input.lastName}`,
        email: input.email,
      });
    } catch (error) {
      throw new NetworkError(
        error instanceof Error ? error.message : 'Failed to submit enterprise contact'
      );
    }
  }
);

// ============================================================
// Machine Definition
// ============================================================

export const registrationMachine = createMachine({
  id: 'registration',
  initial: 'email',
  context: initialContext,
  types: {} as {
    context: RegistrationContext;
    events: RegistrationEvent;
  },
  states: {
    // --------------------------------------------------------
    // Step 1: Email
    // --------------------------------------------------------
    email: {
      entry: ({ context }) => {
        // Start telemetry if not already started
        if (!context.flowStartedAt) {
          emitTelemetry(AUTH_TELEMETRY.REGISTRATION_STARTED, {
            machineId: 'registration',
          });
        }
      },
      on: {
        START: {
          actions: assign({
            flowStartedAt: () => Date.now(),
            retryCount: 0,
          }),
        },
        SET_EMAIL: {
          actions: assign({
            email: ({ event }) => event.email,
            error: null,
          }),
        },
        NEXT: {
          target: 'checkingEmail',
          guard: ({ context }) => context.email.length > 0,
        },
      },
    },

    // Checking if email already exists
    checkingEmail: {
      invoke: {
        id: 'checkEmail',
        src: checkEmailActor,
        input: ({ context }) => ({ email: context.email }),
        onDone: [
          {
            target: 'email',
            guard: ({ event }) => event.output.exists,
            actions: assign({
              error: () =>
                createAuthError(
                  'VALIDATION_ERROR',
                  'An account with this email already exists. Please sign in.',
                  false
                ),
              emailExists: true,
            }),
          },
          {
            target: 'org',
            actions: assign({
              emailExists: false,
              error: null,
            }),
          },
        ],
        onError: {
          target: 'email',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error
                  ? event.error.message
                  : 'Failed to check email. Please try again.',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Step 2: Organization Info
    // --------------------------------------------------------
    org: {
      on: {
        SET_ORG: {
          actions: assign({
            companyName: ({ event }) => event.companyName,
            industry: ({ event }) => event.industry || '',
            teamSize: ({ event }) => event.teamSize || '',
            error: null,
          }),
        },
        NEXT: {
          target: 'account',
          guard: ({ context }) => context.companyName.trim().length > 0,
        },
        BACK: 'email',
      },
    },

    // --------------------------------------------------------
    // Step 3: Account Credentials
    // --------------------------------------------------------
    account: {
      on: {
        SET_ACCOUNT: {
          actions: assign({
            firstName: ({ event }) => event.firstName,
            lastName: ({ event }) => event.lastName,
            password: ({ event }) => event.password,
            error: null,
          }),
        },
        NEXT: {
          target: 'plan',
          guard: ({ context }) =>
            context.firstName.trim().length > 0 &&
            context.lastName.trim().length > 0 &&
            context.password.length >= 8,
        },
        BACK: 'org',
      },
    },

    // --------------------------------------------------------
    // Step 4: Plan Selection
    // --------------------------------------------------------
    plan: {
      on: {
        SET_PLAN: {
          actions: assign({
            plan: ({ event }) => event.plan,
            seatCount: ({ event }) => event.seatCount,
            error: null,
          }),
        },
        SELECT_ENTERPRISE: 'enterpriseContact',
        SUBMIT: {
          target: 'submitting',
          guard: ({ context }) =>
            context.plan === Plan.STARTER || context.plan === Plan.PRO,
        },
        BACK: 'account',
      },
    },

    // --------------------------------------------------------
    // Enterprise Contact Form (side flow)
    // --------------------------------------------------------
    enterpriseContact: {
      on: {
        CANCEL_ENTERPRISE: 'plan',
        SUBMIT: 'submittingEnterprise',
      },
    },

    submittingEnterprise: {
      invoke: {
        id: 'submitEnterprise',
        src: submitEnterpriseActor,
        input: ({ context }) => context,
        onDone: 'enterpriseSuccess',
        onError: {
          target: 'enterpriseContact',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error
                  ? event.error.message
                  : 'Failed to submit. Please try again.',
                true
              ),
          }),
        },
      },
    },

    enterpriseSuccess: {
      type: 'final',
      entry: [
        assign({ error: null }),
        registrationTelemetry.success,
      ],
    },

    // --------------------------------------------------------
    // Submitting Registration
    // --------------------------------------------------------
    submitting: {
      invoke: {
        id: 'submitRegistration',
        src: submitRegistrationActor,
        input: ({ context }) => context,
        onDone: [
          {
            // If checkout URL returned, redirect to Stripe
            target: 'redirectingToCheckout',
            guard: ({ event }) => !!event.output.checkout_url,
            actions: assign({
              checkoutUrl: ({ event }) => event.output.checkout_url || null,
              sessionToken: ({ event }) => event.output.session_token || null,
              error: null,
            }),
          },
          {
            // No checkout needed (enterprise or free tier)
            target: 'success',
            actions: assign({ error: null }),
          },
        ],
        onError: {
          target: 'plan',
          actions: [
            assign({
              error: ({ event }) =>
                createAuthError(
                  'NETWORK_ERROR',
                  event.error instanceof Error
                    ? event.error.message
                    : 'Registration failed. Please try again.',
                  true
                ),
            }),
            registrationTelemetry.failed,
          ],
        },
      },
    },

    // --------------------------------------------------------
    // Redirecting to Stripe Checkout
    // --------------------------------------------------------
    redirectingToCheckout: {
      // This is a transient state - the redirect happens via effect
      entry: [
        ({ context }) => {
          if (context.checkoutUrl) {
            // Redirect will be handled by the React component
            console.log('[Registration] Redirecting to checkout:', context.checkoutUrl);
          }
        },
        ({ context }) => {
          emitTelemetry(AUTH_TELEMETRY.FLOW_COMPLETED, {
            machineId: 'registration',
            duration: context.flowStartedAt
              ? Date.now() - context.flowStartedAt
              : undefined,
            metadata: {
              redirectToCheckout: true,
              plan: context.plan,
            },
          });
        },
      ],
      // Stay in this state - the component will handle the redirect
      type: 'final',
    },

    // --------------------------------------------------------
    // Success States
    // --------------------------------------------------------
    success: {
      type: 'final',
      entry: [
        assign({ error: null }),
        registrationTelemetry.success,
      ],
    },
  },
});

// ============================================================
// Helper to get current step index for progress display
// ============================================================

export const STEPS = ['email', 'org', 'account', 'plan'] as const;
export type StepName = (typeof STEPS)[number];

export function getStepIndex(state: string): number {
  const step = state.split('.')[0] as StepName;
  const index = STEPS.indexOf(step);
  return index >= 0 ? index : 0;
}

export function getStepLabel(step: StepName): string {
  const labels: Record<StepName, string> = {
    email: 'Email',
    org: 'Organization',
    account: 'Account',
    plan: 'Plan',
  };
  return labels[step] || step;
}
