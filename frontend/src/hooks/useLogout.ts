/**
 * useLogout Hook
 *
 * React hook that wraps the logout state machine.
 * Handles:
 * - Triggering logout
 * - Clearing Redux state
 * - Redirecting to landing page
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { useDispatch } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import { logoutMachine, getLogoutRedirectUrl } from '@/machines/logoutMachine';
import { clearAuth } from '@/store/slices/authSlice';
import type { AppDispatch } from '@/store';

// =============================================================================
// Types
// =============================================================================

export interface UseLogoutReturn {
  // Current state
  isIdle: boolean;
  isLoggingOut: boolean;
  isRedirecting: boolean;
  isComplete: boolean;

  // Error info (may have error but still completed logout locally)
  error: { code: string; message: string } | null;
  hadError: boolean;

  // Actions
  startLogout: () => void;

  // Debug
  state: string;
}

// =============================================================================
// Hook
// =============================================================================

export function useLogout(): UseLogoutReturn {
  const dispatch = useDispatch<AppDispatch>();
  const queryClient = useQueryClient();
  const [state, send] = useMachine(logoutMachine);
  const context = state.context;

  // Derive state values
  const stateValue = typeof state.value === 'string' ? state.value : Object.keys(state.value)[0];

  const isIdle = state.matches('idle');
  const isCreatingFlow = state.matches('creatingLogoutFlow');
  const isPerformingLogout = state.matches('performingLogout');
  const isClearingSession = state.matches('clearingSession');
  const isRedirecting = state.matches('redirecting');
  const isComplete = state.matches('complete');

  const isLoggingOut = isCreatingFlow || isPerformingLogout || isClearingSession;

  // --------------------------------------------------------
  // Handle redirect when logout completes
  // --------------------------------------------------------

  useEffect(() => {
    if (isRedirecting) {
      // Clear Redux auth state
      dispatch(clearAuth());

      // Clear React Query cache to prevent stale data on re-login
      queryClient.clear();

      // Redirect to landing page
      const landingUrl = getLogoutRedirectUrl();
      window.location.href = landingUrl;
    }
  }, [isRedirecting, dispatch, queryClient]);

  // --------------------------------------------------------
  // Actions
  // --------------------------------------------------------

  const startLogout = useCallback(() => {
    send({ type: 'START_LOGOUT' });
  }, [send]);

  // --------------------------------------------------------
  // Return
  // --------------------------------------------------------

  return {
    // Current state
    isIdle,
    isLoggingOut,
    isRedirecting,
    isComplete,

    // Error info
    error: context.error,
    hadError: context.error !== null,

    // Actions
    startLogout,

    // Debug
    state: stateValue,
  };
}
