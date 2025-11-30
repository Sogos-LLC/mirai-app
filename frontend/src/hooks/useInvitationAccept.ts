/**
 * useInvitationAccept Hook
 *
 * React hook that wraps the invitation accept state machine.
 * Provides a simple interface for components to interact with invitation acceptance.
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { useRouter } from 'next/navigation';
import {
  invitationAcceptMachine,
  buildRegistrationWithInviteUrl,
  buildLoginWithInviteUrl,
} from '@/machines/invitationAcceptMachine';
import { REDIRECT_URLS } from '@/lib/auth.config';
import type { Invitation } from '@/gen/mirai/v1/invitation_pb';
import type { Company, User } from '@/gen/mirai/v1/common_pb';

// =============================================================================
// Types
// =============================================================================

export interface UseInvitationAcceptReturn {
  // Current state
  isIdle: boolean;
  isFetchingInvitation: boolean;
  isCheckingSession: boolean;
  isNeedsAuth: boolean;
  isEmailMismatch: boolean;
  isAuthenticated: boolean;
  isAccepting: boolean;
  isAccepted: boolean;
  isError: boolean;
  isRedirectingToRegister: boolean;
  isRedirectingToLogin: boolean;
  isLoading: boolean;

  // Data
  invitation: Invitation | null;
  company: Company | null;
  acceptedUser: User | null;
  acceptedCompany: Company | null;
  error: { code: string; message: string; retryable: boolean } | null;
  token: string | null;

  // Computed
  inviteeEmail: string | null;
  companyName: string | null;
  sessionEmail: string | null;

  // Actions
  start: (token: string) => void;
  accept: () => void;
  goToRegister: () => void;
  goToLogin: () => void;
  retry: () => void;
  reset: () => void;

  // Debug
  state: string;
}

// =============================================================================
// Hook
// =============================================================================

export function useInvitationAccept(): UseInvitationAcceptReturn {
  const router = useRouter();
  const [state, send] = useMachine(invitationAcceptMachine);
  const context = state.context;

  // Derive state values
  const stateValue = typeof state.value === 'string' ? state.value : Object.keys(state.value)[0];

  const isIdle = state.matches('idle');
  const isFetchingInvitation = state.matches('fetchingInvitation');
  const isCheckingSession = state.matches('checkingSession');
  const isNeedsAuth = state.matches('needsAuth');
  const isEmailMismatch = state.matches('emailMismatch');
  const isAuthenticated = state.matches('authenticated');
  const isAccepting = state.matches('accepting');
  const isAccepted = state.matches('accepted');
  const isError = state.matches('error');
  const isRedirectingToRegister = state.matches('redirectingToRegister');
  const isRedirectingToLogin = state.matches('redirectingToLogin');

  const isLoading = isFetchingInvitation || isCheckingSession || isAccepting;

  // Computed values
  const inviteeEmail = context.invitation?.email || null;
  const companyName = context.company?.name || null;
  const sessionEmail = context.session?.identity?.traits?.email || null;

  // --------------------------------------------------------
  // Handle redirects based on state
  // --------------------------------------------------------

  useEffect(() => {
    if (isRedirectingToRegister && context.token) {
      const url = buildRegistrationWithInviteUrl(context.token);
      router.push(url);
    }
  }, [isRedirectingToRegister, context.token, router]);

  useEffect(() => {
    if (isRedirectingToLogin && context.token) {
      const url = buildLoginWithInviteUrl(context.token);
      router.push(url);
    }
  }, [isRedirectingToLogin, context.token, router]);

  useEffect(() => {
    // After successful acceptance, redirect to dashboard
    if (isAccepted) {
      router.replace(REDIRECT_URLS.DASHBOARD);
    }
  }, [isAccepted, router]);

  // --------------------------------------------------------
  // Actions
  // --------------------------------------------------------

  const start = useCallback(
    (token: string) => {
      send({ type: 'START', token });
    },
    [send]
  );

  const accept = useCallback(() => {
    send({ type: 'ACCEPT' });
  }, [send]);

  const goToRegister = useCallback(() => {
    send({ type: 'GO_TO_REGISTER' });
  }, [send]);

  const goToLogin = useCallback(() => {
    send({ type: 'GO_TO_LOGIN' });
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
    isCheckingSession,
    isNeedsAuth,
    isEmailMismatch,
    isAuthenticated,
    isAccepting,
    isAccepted,
    isError,
    isRedirectingToRegister,
    isRedirectingToLogin,
    isLoading,

    // Data
    invitation: context.invitation,
    company: context.company,
    acceptedUser: context.acceptedUser,
    acceptedCompany: context.acceptedCompany,
    error: context.error,
    token: context.token,

    // Computed
    inviteeEmail,
    companyName,
    sessionEmail,

    // Actions
    start,
    accept,
    goToRegister,
    goToLogin,
    retry,
    reset,

    // Debug
    state: stateValue,
  };
}
