/**
 * useLogin Hook
 *
 * React hook that wraps the login state machine.
 * Provides a simple interface for components to interact with login flow.
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { useRouter } from 'next/navigation';
import { loginMachine, buildKratosLoginUrl, getLoginRedirectUrl } from '@/machines/loginMachine';
import type { LoginFlow } from '@/lib/kratos/types';

// =============================================================================
// Types
// =============================================================================

export interface UseLoginReturn {
  // Current state
  isIdle: boolean;
  isCheckingSession: boolean;
  isCheckingFlow: boolean;
  isFetchingFlow: boolean;
  isReady: boolean;
  isError: boolean;
  isFlowExpired: boolean;
  isAlreadyAuthenticated: boolean;
  needsKratosRedirect: boolean;
  isLoading: boolean;

  // Data
  flow: LoginFlow | null;
  error: { code: string; message: string } | null;
  checkoutSuccess: boolean;
  returnTo: string | null;

  // Actions
  start: (params?: { flowId?: string; returnTo?: string; checkoutSuccess?: boolean }) => void;
  retry: () => void;
  reset: () => void;

  // Debug
  state: string;
}

// =============================================================================
// Hook
// =============================================================================

export function useLogin(): UseLoginReturn {
  const router = useRouter();
  const [state, send] = useMachine(loginMachine);
  const context = state.context;

  // Derive state values
  const stateValue = typeof state.value === 'string' ? state.value : Object.keys(state.value)[0];

  const isIdle = state.matches('idle');
  const isCheckingSession = state.matches('checkingSession');
  const isCheckingFlow = state.matches('checkingFlow');
  const isFetchingFlow = state.matches('fetchingFlow');
  const isReady = state.matches('ready');
  const isError = state.matches('error');
  const isFlowExpired = state.matches('flowExpired');
  const isAlreadyAuthenticated = state.matches('alreadyAuthenticated');
  const needsKratosRedirect = state.matches('needsKratosRedirect');

  const isLoading = isCheckingSession || isCheckingFlow || isFetchingFlow;

  // --------------------------------------------------------
  // Handle redirects based on state
  // --------------------------------------------------------

  useEffect(() => {
    // User is already authenticated - redirect to dashboard
    if (isAlreadyAuthenticated) {
      const destination = getLoginRedirectUrl(context.returnTo);
      router.replace(destination);
    }
  }, [isAlreadyAuthenticated, context.returnTo, router]);

  useEffect(() => {
    // Need to redirect to Kratos for fresh flow
    if (needsKratosRedirect) {
      const kratosUrl = buildKratosLoginUrl(context.returnTo || undefined);
      // Use replace to avoid adding stale flow URLs to browser history
      window.location.replace(kratosUrl);
    }
  }, [needsKratosRedirect, context.returnTo]);

  useEffect(() => {
    // Flow expired - redirect to Kratos for fresh flow
    if (isFlowExpired) {
      const kratosUrl = buildKratosLoginUrl(context.returnTo || undefined);
      window.location.replace(kratosUrl);
    }
  }, [isFlowExpired, context.returnTo]);

  // --------------------------------------------------------
  // Actions
  // --------------------------------------------------------

  const start = useCallback(
    (params?: { flowId?: string; returnTo?: string; checkoutSuccess?: boolean }) => {
      send({
        type: 'START',
        flowId: params?.flowId,
        returnTo: params?.returnTo,
        checkoutSuccess: params?.checkoutSuccess,
      });
    },
    [send]
  );

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
    isCheckingSession,
    isCheckingFlow,
    isFetchingFlow,
    isReady,
    isError,
    isFlowExpired,
    isAlreadyAuthenticated,
    needsKratosRedirect,
    isLoading,

    // Data
    flow: context.flow,
    error: context.error,
    checkoutSuccess: context.checkoutSuccess,
    returnTo: context.returnTo,

    // Actions
    start,
    retry,
    reset,

    // Debug
    state: stateValue,
  };
}
