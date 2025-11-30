/**
 * Shared Guards for State Machines
 *
 * Guard functions used across all authentication and organization
 * state machines. Guards are pure functions that determine whether
 * a transition should be allowed.
 *
 * Contract: Guards use proto enums (Role) directly.
 */

import { Role } from '@/gen/mirai/v1/common_pb';
import type { AuthBaseContext, AuthError } from './types';

// =============================================================================
// Authentication Guards
// =============================================================================

/**
 * Check if user has a valid session token
 */
export function isAuthenticated<T extends Pick<AuthBaseContext, 'sessionToken' | 'user'>>({
  context,
}: {
  context: T;
}): boolean {
  return context.sessionToken !== null && context.user !== null;
}

/**
 * Check if user has session token (even without user data loaded)
 */
export function hasSessionToken<T extends Pick<AuthBaseContext, 'sessionToken'>>({
  context,
}: {
  context: T;
}): boolean {
  return context.sessionToken !== null;
}

// =============================================================================
// Role Guards
// =============================================================================

/**
 * Check if user is an admin (ADMIN or OWNER role)
 */
export function isAdmin<T extends Pick<AuthBaseContext, 'user'>>({
  context,
}: {
  context: T;
}): boolean {
  if (!context.user) return false;
  const role = context.user.role;
  return role === Role.ADMIN || role === Role.OWNER;
}

/**
 * Check if user is the owner
 */
export function isOwner<T extends Pick<AuthBaseContext, 'user'>>({
  context,
}: {
  context: T;
}): boolean {
  if (!context.user) return false;
  return context.user.role === Role.OWNER;
}

/**
 * Check if user has a company
 */
export function hasCompany<T extends Pick<AuthBaseContext, 'company'>>({
  context,
}: {
  context: T;
}): boolean {
  return context.company !== null;
}

// =============================================================================
// Retry Guards
// =============================================================================

/**
 * Maximum retry attempts before giving up
 */
export const MAX_RETRY_COUNT = 3;

/**
 * Check if we can retry the current operation
 */
export function canRetry<T extends Pick<AuthBaseContext, 'retryCount' | 'error'>>({
  context,
}: {
  context: T;
}): boolean {
  if (context.retryCount >= MAX_RETRY_COUNT) return false;
  if (!context.error) return true;
  return context.error.retryable;
}

/**
 * Check if error is retryable
 */
export function isRetryableError<T extends { error: AuthError | null }>({
  context,
}: {
  context: T;
}): boolean {
  return context.error?.retryable ?? false;
}

// =============================================================================
// Validation Guards
// =============================================================================

/**
 * Check if email is valid format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if password meets minimum requirements
 */
export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

/**
 * Check if a string is non-empty after trimming
 */
export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

// =============================================================================
// Flow Guards
// =============================================================================

/**
 * Check if there's no current error
 */
export function hasNoError<T extends Pick<AuthBaseContext, 'error'>>({
  context,
}: {
  context: T;
}): boolean {
  return context.error === null;
}

/**
 * Check if flow has started (for telemetry)
 */
export function hasFlowStarted<T extends Pick<AuthBaseContext, 'flowStartedAt'>>({
  context,
}: {
  context: T;
}): boolean {
  return context.flowStartedAt !== null;
}

// =============================================================================
// Guard Factory
// =============================================================================

/**
 * Create a guard that checks for a specific error code
 */
export function hasErrorCode(code: string) {
  return <T extends Pick<AuthBaseContext, 'error'>>({ context }: { context: T }): boolean => {
    return context.error?.code === code;
  };
}

/**
 * Combine multiple guards with AND logic
 */
export function allOf<T>(
  ...guards: Array<(params: { context: T }) => boolean>
): (params: { context: T }) => boolean {
  return (params) => guards.every((guard) => guard(params));
}

/**
 * Combine multiple guards with OR logic
 */
export function anyOf<T>(
  ...guards: Array<(params: { context: T }) => boolean>
): (params: { context: T }) => boolean {
  return (params) => guards.some((guard) => guard(params));
}

/**
 * Negate a guard
 */
export function not<T>(
  guard: (params: { context: T }) => boolean
): (params: { context: T }) => boolean {
  return (params) => !guard(params);
}
