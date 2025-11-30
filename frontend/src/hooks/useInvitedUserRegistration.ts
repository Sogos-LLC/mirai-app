/**
 * useInvitedUserRegistration Hook
 *
 * React hook that wraps the invited user registration state machine.
 * Provides a simple interface for the accept-invite page to handle inline registration.
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { useRouter } from 'next/navigation';
import {
  invitedUserMachine,
  getWelcomeDashboardUrl,
} from '@/machines/invitedUserMachine';
import type { Invitation } from '@/gen/mirai/v1/invitation_pb';
import type { Company, User } from '@/gen/mirai/v1/common_pb';

// =============================================================================
// Types
// =============================================================================

export interface UseInvitedUserRegistrationReturn {
  // Current state
  isIdle: boolean;
  isFetchingInvitation: boolean;
  isCollectingInfo: boolean;
  isSubmitting: boolean;
  isSuccess: boolean;
  isError: boolean;
  isLoading: boolean;

  // Data
  invitation: Invitation | null;
  company: Company | null;
  user: User | null;
  error: { code: string; message: string; retryable: boolean } | null;
  token: string | null;

  // Form data
  firstName: string;
  lastName: string;
  password: string;

  // Computed
  inviteeEmail: string | null;
  companyName: string | null;

  // Actions
  start: (token: string) => void;
  setForm: (firstName: string, lastName: string, password: string) => void;
  submit: () => void;
  retry: () => void;
  reset: () => void;

  // Debug
  state: string;
}

// =============================================================================
// Hook
// =============================================================================

export function useInvitedUserRegistration(): UseInvitedUserRegistrationReturn {
  const router = useRouter();
  const [state, send] = useMachine(invitedUserMachine);
  const context = state.context;

  // Derive state values
  const stateValue = typeof state.value === 'string' ? state.value : Object.keys(state.value)[0];

  const isIdle = state.matches('idle');
  const isFetchingInvitation = state.matches('fetchingInvitation');
  const isCollectingInfo = state.matches('collectingInfo');
  const isSubmitting = state.matches('submitting') || state.matches('settingSession');
  const isSuccess = state.matches('success');
  const isError = state.matches('error');

  const isLoading = isFetchingInvitation || isSubmitting;

  // Computed values
  const inviteeEmail = context.invitation?.email || null;
  const companyName = context.company?.name || null;

  // --------------------------------------------------------
  // Handle redirect on success
  // --------------------------------------------------------

  useEffect(() => {
    if (isSuccess) {
      // Redirect to dashboard with welcome flag for confetti
      router.replace(getWelcomeDashboardUrl());
    }
  }, [isSuccess, router]);

  // --------------------------------------------------------
  // Actions
  // --------------------------------------------------------

  const start = useCallback(
    (token: string) => {
      send({ type: 'START', token });
    },
    [send]
  );

  const setForm = useCallback(
    (firstName: string, lastName: string, password: string) => {
      send({ type: 'SET_FORM', firstName, lastName, password });
    },
    [send]
  );

  const submit = useCallback(() => {
    send({ type: 'SUBMIT' });
  }, [send]);

  const retry = useCallback(() => {
    send({ type: 'RETRY' });
  }, [send]);

  const reset = useCallback(() => {
    send({ type: 'RESET' });
  }, [send]);

  // --------------------------------------------------------
  // Return
  // --------------------------------------------------------

  return {
    // Current state
    isIdle,
    isFetchingInvitation,
    isCollectingInfo,
    isSubmitting,
    isSuccess,
    isError,
    isLoading,

    // Data
    invitation: context.invitation,
    company: context.company,
    user: context.user,
    error: context.error,
    token: context.token,

    // Form data
    firstName: context.firstName,
    lastName: context.lastName,
    password: context.password,

    // Computed
    inviteeEmail,
    companyName,

    // Actions
    start,
    setForm,
    submit,
    retry,
    reset,

    // Debug
    state: stateValue,
  };
}
