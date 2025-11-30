/**
 * Shared Types for State Machines
 *
 * Common context types, error types, and event types used across
 * all authentication and organization state machines.
 *
 * Contract: All types here are derived from proto definitions and
 * auth.config.ts patterns.
 */

import type { User, Company, Role } from '@/gen/mirai/v1/common_pb';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Standard error codes used across all auth/org machines
 */
export type AuthErrorCode =
  | 'NETWORK_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'SESSION_EXPIRED'
  | 'FLOW_EXPIRED'
  | 'UNAUTHORIZED'
  | 'SEAT_LIMIT_EXCEEDED'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_INVALID'
  | 'INVITATION_REVOKED'
  | 'INVITATION_ALREADY_ACCEPTED'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

/**
 * Structured error type for state machine context
 */
export interface AuthError {
  code: AuthErrorCode;
  message: string;
  retryable: boolean;
}

/**
 * Create an AuthError with common defaults
 */
export function createAuthError(
  code: AuthErrorCode,
  message: string,
  retryable = false
): AuthError {
  return { code, message, retryable };
}

/**
 * Map error codes to user-friendly messages
 */
export const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  INVALID_CREDENTIALS: 'Invalid email or password. Please try again.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  FLOW_EXPIRED: 'This page has expired. Please refresh and try again.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  SEAT_LIMIT_EXCEEDED: 'No seats available. Please upgrade your plan or remove a team member.',
  INVITATION_EXPIRED: 'This invitation has expired. Please request a new one.',
  INVITATION_INVALID: 'This invitation link is invalid.',
  INVITATION_REVOKED: 'This invitation has been revoked.',
  INVITATION_ALREADY_ACCEPTED: 'This invitation has already been used.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  UNKNOWN: 'An unexpected error occurred. Please try again.',
};

// =============================================================================
// Base Context Types
// =============================================================================

/**
 * Base context shared by all auth-related state machines
 */
export interface AuthBaseContext {
  /** Session token from API flow (stored in ory_session_token cookie) */
  sessionToken: string | null;

  /** Whether user is currently authenticated */
  isAuthenticated: boolean;

  /** Current user (from Kratos identity) */
  user: User | null;

  /** User's company */
  company: Company | null;

  /** Current error state */
  error: AuthError | null;

  /** Retry counter for retryable operations */
  retryCount: number;

  /** Timestamp when flow started (for telemetry) */
  flowStartedAt: number | null;
}

/**
 * Initial base context values
 */
export const initialAuthBaseContext: AuthBaseContext = {
  sessionToken: null,
  isAuthenticated: false,
  user: null,
  company: null,
  error: null,
  retryCount: 0,
  flowStartedAt: null,
};

// =============================================================================
// Base Event Types
// =============================================================================

/**
 * Standard events available in all machines
 */
export type BaseAuthEvent =
  | { type: 'RETRY' }
  | { type: 'RESET' }
  | { type: 'DISMISS_ERROR' };

// =============================================================================
// Custom Error Classes
// =============================================================================

/**
 * Error thrown when Kratos flow has expired (410 Gone)
 */
export class FlowExpiredError extends Error {
  readonly code = 'FLOW_EXPIRED' as const;

  constructor(message = 'Flow has expired') {
    super(message);
    this.name = 'FlowExpiredError';
  }
}

/**
 * Error thrown on invalid credentials (400 with credential error)
 */
export class CredentialsError extends Error {
  readonly code = 'INVALID_CREDENTIALS' as const;

  constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'CredentialsError';
  }
}

/**
 * Error thrown on network failures
 */
export class NetworkError extends Error {
  readonly code = 'NETWORK_ERROR' as const;

  constructor(message = 'Network error') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown when session has expired
 */
export class SessionExpiredError extends Error {
  readonly code = 'SESSION_EXPIRED' as const;

  constructor(message = 'Session expired') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

/**
 * Error thrown when invitation has expired
 */
export class InvitationExpiredError extends Error {
  readonly code = 'INVITATION_EXPIRED' as const;

  constructor(message = 'Invitation has expired') {
    super(message);
    this.name = 'InvitationExpiredError';
  }
}

/**
 * Error thrown when invitation is invalid/not found
 */
export class InvitationInvalidError extends Error {
  readonly code = 'INVITATION_INVALID' as const;

  constructor(message = 'Invitation is invalid or not found') {
    super(message);
    this.name = 'InvitationInvalidError';
  }
}

/**
 * Error thrown when invitation has been revoked
 */
export class InvitationRevokedError extends Error {
  readonly code = 'INVITATION_REVOKED' as const;

  constructor(message = 'Invitation has been revoked') {
    super(message);
    this.name = 'InvitationRevokedError';
  }
}

/**
 * Error thrown when invitation has already been accepted
 */
export class InvitationAlreadyAcceptedError extends Error {
  readonly code = 'INVITATION_ALREADY_ACCEPTED' as const;

  constructor(message = 'Invitation has already been accepted') {
    super(message);
    this.name = 'InvitationAlreadyAcceptedError';
  }
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an error is a FlowExpiredError
 */
export function isFlowExpiredError(error: unknown): error is FlowExpiredError {
  return error instanceof FlowExpiredError;
}

/**
 * Check if an error is a CredentialsError
 */
export function isCredentialsError(error: unknown): error is CredentialsError {
  return error instanceof CredentialsError;
}

/**
 * Check if an error is a NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Check if an error is an InvitationExpiredError
 */
export function isInvitationExpiredError(error: unknown): error is InvitationExpiredError {
  return error instanceof InvitationExpiredError;
}

/**
 * Check if an error is an InvitationInvalidError
 */
export function isInvitationInvalidError(error: unknown): error is InvitationInvalidError {
  return error instanceof InvitationInvalidError;
}

/**
 * Check if an error is an InvitationRevokedError
 */
export function isInvitationRevokedError(error: unknown): error is InvitationRevokedError {
  return error instanceof InvitationRevokedError;
}

/**
 * Check if an error is an InvitationAlreadyAcceptedError
 */
export function isInvitationAlreadyAcceptedError(
  error: unknown
): error is InvitationAlreadyAcceptedError {
  return error instanceof InvitationAlreadyAcceptedError;
}

/**
 * Extract error message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

/**
 * Map an error to an AuthError
 */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof FlowExpiredError) {
    return createAuthError('FLOW_EXPIRED', error.message, true);
  }
  if (error instanceof CredentialsError) {
    return createAuthError('INVALID_CREDENTIALS', error.message, false);
  }
  if (error instanceof NetworkError) {
    return createAuthError('NETWORK_ERROR', error.message, true);
  }
  if (error instanceof SessionExpiredError) {
    return createAuthError('SESSION_EXPIRED', error.message, false);
  }
  if (error instanceof InvitationExpiredError) {
    return createAuthError('INVITATION_EXPIRED', error.message, false);
  }
  if (error instanceof InvitationInvalidError) {
    return createAuthError('INVITATION_INVALID', error.message, false);
  }
  if (error instanceof InvitationRevokedError) {
    return createAuthError('INVITATION_REVOKED', error.message, false);
  }
  if (error instanceof InvitationAlreadyAcceptedError) {
    return createAuthError('INVITATION_ALREADY_ACCEPTED', error.message, false);
  }

  return createAuthError('UNKNOWN', getErrorMessage(error), true);
}
