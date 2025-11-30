'use client';

import { useEffect, useCallback } from 'react';
import { useMachine } from '@xstate/react';
import { useRouter } from 'next/navigation';
import {
  registrationMachine,
  getStepIndex,
  STEPS,
  type RegistrationContext,
  type StepName,
} from '@/machines/registrationMachine';
import { Plan } from '@/gen/mirai/v1/common_pb';
import { setSessionTokenCookie, REDIRECT_URLS } from '@/lib/auth.config';
import type { AuthError } from '@/machines/shared/types';

/**
 * Hook return type for better TypeScript inference
 */
export interface UseRegistrationReturn {
  // Current state
  currentStep: StepName;
  stepIndex: number;
  totalSteps: number;
  isLoading: boolean;
  /** Error message string for display */
  error: string | null;
  /** Full error object with code and retryable flag */
  errorDetails: AuthError | null;

  // Context data
  data: RegistrationContext;

  // State checks
  isEmailStep: boolean;
  isOrgStep: boolean;
  isAccountStep: boolean;
  isPlanStep: boolean;
  isEnterpriseContact: boolean;
  isSuccess: boolean;
  isEnterpriseSuccess: boolean;

  // Actions
  setEmail: (email: string) => void;
  setOrg: (companyName: string, industry?: string, teamSize?: string) => void;
  setAccount: (firstName: string, lastName: string, password: string) => void;
  setPlan: (plan: Plan, seatCount: number) => void;
  next: () => void;
  back: () => void;
  submit: () => void;
  selectEnterprise: () => void;
  cancelEnterprise: () => void;
  reset: () => void;

  // For debugging
  state: string;
}

/**
 * Custom hook for registration wizard state management
 *
 * Uses XState for predictable state transitions and side effects.
 * All business logic is encapsulated in the state machine.
 */
export function useRegistration(): UseRegistrationReturn {
  const router = useRouter();

  // XState v5: actors are defined in the machine itself via fromPromise
  const [state, send] = useMachine(registrationMachine);

  const context = state.context;
  const stateValue = typeof state.value === 'string' ? state.value : Object.keys(state.value)[0];

  // --------------------------------------------------------
  // Handle redirects when reaching final states
  // --------------------------------------------------------
  useEffect(() => {
    // Redirect to Stripe checkout
    if (state.matches('redirectingToCheckout') && context.checkoutUrl) {
      console.log('[useRegistration] Preparing to redirect to Stripe checkout');

      // Set the session token cookie BEFORE redirecting to Stripe
      // Uses auth.config.ts central configuration for cookie name and attributes
      // The middleware will read this cookie and send it as Authorization: Bearer to Kratos
      if (context.sessionToken) {
        console.log('[useRegistration] Setting session token cookie before redirect');
        setSessionTokenCookie(context.sessionToken);
      } else {
        console.warn('[useRegistration] No session token available for cookie');
      }

      console.log('[useRegistration] Redirecting to Stripe checkout');
      window.location.href = context.checkoutUrl;
    }

    // Redirect to dashboard on success (non-payment flow)
    if (state.matches('success')) {
      console.log('[useRegistration] Registration success, redirecting to dashboard');
      router.push(REDIRECT_URLS.DASHBOARD);
    }
  }, [state, context.checkoutUrl, context.sessionToken, router]);

  // --------------------------------------------------------
  // Actions
  // --------------------------------------------------------
  const setEmail = useCallback(
    (email: string) => send({ type: 'SET_EMAIL', email }),
    [send]
  );

  const setOrg = useCallback(
    (companyName: string, industry?: string, teamSize?: string) =>
      send({ type: 'SET_ORG', companyName, industry, teamSize }),
    [send]
  );

  const setAccount = useCallback(
    (firstName: string, lastName: string, password: string) =>
      send({ type: 'SET_ACCOUNT', firstName, lastName, password }),
    [send]
  );

  const setPlan = useCallback(
    (plan: Plan, seatCount: number) => send({ type: 'SET_PLAN', plan, seatCount }),
    [send]
  );

  const next = useCallback(() => send({ type: 'NEXT' }), [send]);
  const back = useCallback(() => send({ type: 'BACK' }), [send]);
  const submit = useCallback(() => send({ type: 'SUBMIT' }), [send]);
  const selectEnterprise = useCallback(() => send({ type: 'SELECT_ENTERPRISE' }), [send]);
  const cancelEnterprise = useCallback(() => send({ type: 'CANCEL_ENTERPRISE' }), [send]);
  const reset = useCallback(() => send({ type: 'RESET' }), [send]);

  // --------------------------------------------------------
  // Computed values
  // --------------------------------------------------------
  const stepIndex = getStepIndex(stateValue);
  const isLoading =
    state.matches('checkingEmail') ||
    state.matches('submitting') ||
    state.matches('submittingEnterprise') ||
    state.matches('redirectingToCheckout');

  return {
    // Current state
    currentStep: STEPS[stepIndex] || 'email',
    stepIndex,
    totalSteps: STEPS.length,
    isLoading,
    error: context.error?.message || null,
    errorDetails: context.error,

    // Context data
    data: context,

    // State checks
    isEmailStep: state.matches('email') || state.matches('checkingEmail'),
    isOrgStep: state.matches('org'),
    isAccountStep: state.matches('account'),
    isPlanStep: state.matches('plan'),
    isEnterpriseContact:
      state.matches('enterpriseContact') || state.matches('submittingEnterprise'),
    isSuccess: state.matches('success'),
    isEnterpriseSuccess: state.matches('enterpriseSuccess'),

    // Actions
    setEmail,
    setOrg,
    setAccount,
    setPlan,
    next,
    back,
    submit,
    selectEnterprise,
    cancelEnterprise,
    reset,

    // For debugging
    state: stateValue,
  };
}
