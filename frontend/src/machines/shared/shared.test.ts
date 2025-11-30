/**
 * Unit Tests for Shared State Machine Utilities
 *
 * These tests lock in the contract for shared types, guards, and telemetry
 * used across all authentication and organization state machines.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Role } from '@/gen/mirai/v1/common_pb';

// =============================================================================
// Types Tests
// =============================================================================

import {
  createAuthError,
  ERROR_MESSAGES,
  FlowExpiredError,
  CredentialsError,
  NetworkError,
  SessionExpiredError,
  isFlowExpiredError,
  isCredentialsError,
  isNetworkError,
  getErrorMessage,
  toAuthError,
  initialAuthBaseContext,
  type AuthErrorCode,
} from './types';

describe('Shared Types', () => {
  describe('createAuthError', () => {
    it('should create an AuthError with all properties', () => {
      const error = createAuthError('NETWORK_ERROR', 'Connection failed', true);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Connection failed');
      expect(error.retryable).toBe(true);
    });

    it('should default retryable to false', () => {
      const error = createAuthError('INVALID_CREDENTIALS', 'Bad password');
      expect(error.retryable).toBe(false);
    });

    it('should create errors for all error codes', () => {
      const codes: AuthErrorCode[] = [
        'NETWORK_ERROR',
        'INVALID_CREDENTIALS',
        'SESSION_EXPIRED',
        'FLOW_EXPIRED',
        'UNAUTHORIZED',
        'SEAT_LIMIT_EXCEEDED',
        'INVITATION_EXPIRED',
        'INVITATION_INVALID',
        'INVITATION_REVOKED',
        'INVITATION_ALREADY_ACCEPTED',
        'VALIDATION_ERROR',
        'UNKNOWN',
      ];

      codes.forEach((code) => {
        const error = createAuthError(code, `Test message for ${code}`);
        expect(error.code).toBe(code);
      });
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('should have user-friendly message for NETWORK_ERROR', () => {
      expect(ERROR_MESSAGES.NETWORK_ERROR).toContain('Network');
    });

    it('should have user-friendly message for INVALID_CREDENTIALS', () => {
      expect(ERROR_MESSAGES.INVALID_CREDENTIALS).toContain('Invalid');
    });

    it('should have user-friendly message for SESSION_EXPIRED', () => {
      expect(ERROR_MESSAGES.SESSION_EXPIRED).toContain('expired');
    });

    it('should have user-friendly message for FLOW_EXPIRED', () => {
      expect(ERROR_MESSAGES.FLOW_EXPIRED).toContain('expired');
    });

    it('should have user-friendly message for SEAT_LIMIT_EXCEEDED', () => {
      expect(ERROR_MESSAGES.SEAT_LIMIT_EXCEEDED).toContain('seat');
    });

    it('should have message for all error codes', () => {
      const codes: AuthErrorCode[] = [
        'NETWORK_ERROR',
        'INVALID_CREDENTIALS',
        'SESSION_EXPIRED',
        'FLOW_EXPIRED',
        'UNAUTHORIZED',
        'SEAT_LIMIT_EXCEEDED',
        'INVITATION_EXPIRED',
        'INVITATION_INVALID',
        'INVITATION_REVOKED',
        'INVITATION_ALREADY_ACCEPTED',
        'VALIDATION_ERROR',
        'UNKNOWN',
      ];

      codes.forEach((code) => {
        expect(ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof ERROR_MESSAGES[code]).toBe('string');
        expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
      });
    });
  });

  describe('Custom Error Classes', () => {
    describe('FlowExpiredError', () => {
      it('should have correct name and code', () => {
        const error = new FlowExpiredError();
        expect(error.name).toBe('FlowExpiredError');
        expect(error.code).toBe('FLOW_EXPIRED');
      });

      it('should have default message', () => {
        const error = new FlowExpiredError();
        expect(error.message).toBe('Flow has expired');
      });

      it('should accept custom message', () => {
        const error = new FlowExpiredError('Custom flow message');
        expect(error.message).toBe('Custom flow message');
      });

      it('should be instanceof Error', () => {
        const error = new FlowExpiredError();
        expect(error instanceof Error).toBe(true);
      });
    });

    describe('CredentialsError', () => {
      it('should have correct name and code', () => {
        const error = new CredentialsError();
        expect(error.name).toBe('CredentialsError');
        expect(error.code).toBe('INVALID_CREDENTIALS');
      });

      it('should have default message', () => {
        const error = new CredentialsError();
        expect(error.message).toBe('Invalid credentials');
      });

      it('should accept custom message', () => {
        const error = new CredentialsError('Wrong password');
        expect(error.message).toBe('Wrong password');
      });
    });

    describe('NetworkError', () => {
      it('should have correct name and code', () => {
        const error = new NetworkError();
        expect(error.name).toBe('NetworkError');
        expect(error.code).toBe('NETWORK_ERROR');
      });

      it('should have default message', () => {
        const error = new NetworkError();
        expect(error.message).toBe('Network error');
      });

      it('should accept custom message', () => {
        const error = new NetworkError('Server unreachable');
        expect(error.message).toBe('Server unreachable');
      });
    });

    describe('SessionExpiredError', () => {
      it('should have correct name and code', () => {
        const error = new SessionExpiredError();
        expect(error.name).toBe('SessionExpiredError');
        expect(error.code).toBe('SESSION_EXPIRED');
      });

      it('should have default message', () => {
        const error = new SessionExpiredError();
        expect(error.message).toBe('Session expired');
      });

      it('should accept custom message', () => {
        const error = new SessionExpiredError('Please login again');
        expect(error.message).toBe('Please login again');
      });
    });
  });

  describe('Type Guards', () => {
    describe('isFlowExpiredError', () => {
      it('should return true for FlowExpiredError', () => {
        expect(isFlowExpiredError(new FlowExpiredError())).toBe(true);
      });

      it('should return false for other errors', () => {
        expect(isFlowExpiredError(new Error())).toBe(false);
        expect(isFlowExpiredError(new NetworkError())).toBe(false);
        expect(isFlowExpiredError(null)).toBe(false);
        expect(isFlowExpiredError('error')).toBe(false);
      });
    });

    describe('isCredentialsError', () => {
      it('should return true for CredentialsError', () => {
        expect(isCredentialsError(new CredentialsError())).toBe(true);
      });

      it('should return false for other errors', () => {
        expect(isCredentialsError(new Error())).toBe(false);
        expect(isCredentialsError(new FlowExpiredError())).toBe(false);
      });
    });

    describe('isNetworkError', () => {
      it('should return true for NetworkError', () => {
        expect(isNetworkError(new NetworkError())).toBe(true);
      });

      it('should return false for other errors', () => {
        expect(isNetworkError(new Error())).toBe(false);
        expect(isNetworkError(new CredentialsError())).toBe(false);
      });
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it('should return string as-is', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should return fallback for other types', () => {
      expect(getErrorMessage(123)).toBe('An unexpected error occurred');
      expect(getErrorMessage(null)).toBe('An unexpected error occurred');
      expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
      expect(getErrorMessage({ foo: 'bar' })).toBe('An unexpected error occurred');
    });
  });

  describe('toAuthError', () => {
    it('should convert FlowExpiredError to AuthError', () => {
      const error = new FlowExpiredError('Flow expired');
      const authError = toAuthError(error);
      expect(authError.code).toBe('FLOW_EXPIRED');
      expect(authError.message).toBe('Flow expired');
      expect(authError.retryable).toBe(true);
    });

    it('should convert CredentialsError to AuthError', () => {
      const error = new CredentialsError('Wrong password');
      const authError = toAuthError(error);
      expect(authError.code).toBe('INVALID_CREDENTIALS');
      expect(authError.message).toBe('Wrong password');
      expect(authError.retryable).toBe(false);
    });

    it('should convert NetworkError to AuthError', () => {
      const error = new NetworkError('Connection failed');
      const authError = toAuthError(error);
      expect(authError.code).toBe('NETWORK_ERROR');
      expect(authError.message).toBe('Connection failed');
      expect(authError.retryable).toBe(true);
    });

    it('should convert SessionExpiredError to AuthError', () => {
      const error = new SessionExpiredError();
      const authError = toAuthError(error);
      expect(authError.code).toBe('SESSION_EXPIRED');
      expect(authError.retryable).toBe(false);
    });

    it('should convert unknown errors to UNKNOWN AuthError', () => {
      const authError = toAuthError(new Error('Generic error'));
      expect(authError.code).toBe('UNKNOWN');
      expect(authError.message).toBe('Generic error');
      expect(authError.retryable).toBe(true);
    });

    it('should handle non-Error values', () => {
      const authError = toAuthError('string error');
      expect(authError.code).toBe('UNKNOWN');
      expect(authError.retryable).toBe(true);
    });
  });

  describe('initialAuthBaseContext', () => {
    it('should have null sessionToken', () => {
      expect(initialAuthBaseContext.sessionToken).toBeNull();
    });

    it('should have false isAuthenticated', () => {
      expect(initialAuthBaseContext.isAuthenticated).toBe(false);
    });

    it('should have null user', () => {
      expect(initialAuthBaseContext.user).toBeNull();
    });

    it('should have null company', () => {
      expect(initialAuthBaseContext.company).toBeNull();
    });

    it('should have null error', () => {
      expect(initialAuthBaseContext.error).toBeNull();
    });

    it('should have 0 retryCount', () => {
      expect(initialAuthBaseContext.retryCount).toBe(0);
    });

    it('should have null flowStartedAt', () => {
      expect(initialAuthBaseContext.flowStartedAt).toBeNull();
    });
  });
});

// =============================================================================
// Guards Tests
// =============================================================================

import {
  isAuthenticated,
  hasSessionToken,
  isAdmin,
  isOwner,
  hasCompany,
  canRetry,
  isRetryableError,
  isValidEmail,
  isValidPassword,
  isNonEmpty,
  hasNoError,
  hasFlowStarted,
  hasErrorCode,
  allOf,
  anyOf,
  not,
  MAX_RETRY_COUNT,
} from './guards';

describe('Shared Guards', () => {
  describe('isAuthenticated', () => {
    it('should return true when sessionToken and user exist', () => {
      const context = {
        sessionToken: 'token123',
        user: { id: 'user1', role: Role.MEMBER } as any,
      };
      expect(isAuthenticated({ context })).toBe(true);
    });

    it('should return false when sessionToken is null', () => {
      const context = {
        sessionToken: null,
        user: { id: 'user1', role: Role.MEMBER } as any,
      };
      expect(isAuthenticated({ context })).toBe(false);
    });

    it('should return false when user is null', () => {
      const context = {
        sessionToken: 'token123',
        user: null,
      };
      expect(isAuthenticated({ context })).toBe(false);
    });

    it('should return false when both are null', () => {
      const context = {
        sessionToken: null,
        user: null,
      };
      expect(isAuthenticated({ context })).toBe(false);
    });
  });

  describe('hasSessionToken', () => {
    it('should return true when sessionToken exists', () => {
      const context = { sessionToken: 'token123' };
      expect(hasSessionToken({ context })).toBe(true);
    });

    it('should return false when sessionToken is null', () => {
      const context = { sessionToken: null };
      expect(hasSessionToken({ context })).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should return true for ADMIN role', () => {
      const context = { user: { role: Role.ADMIN } as any };
      expect(isAdmin({ context })).toBe(true);
    });

    it('should return true for OWNER role', () => {
      const context = { user: { role: Role.OWNER } as any };
      expect(isAdmin({ context })).toBe(true);
    });

    it('should return false for MEMBER role', () => {
      const context = { user: { role: Role.MEMBER } as any };
      expect(isAdmin({ context })).toBe(false);
    });

    it('should return false for UNSPECIFIED role', () => {
      const context = { user: { role: Role.UNSPECIFIED } as any };
      expect(isAdmin({ context })).toBe(false);
    });

    it('should return false when user is null', () => {
      const context = { user: null };
      expect(isAdmin({ context })).toBe(false);
    });
  });

  describe('isOwner', () => {
    it('should return true for OWNER role', () => {
      const context = { user: { role: Role.OWNER } as any };
      expect(isOwner({ context })).toBe(true);
    });

    it('should return false for ADMIN role', () => {
      const context = { user: { role: Role.ADMIN } as any };
      expect(isOwner({ context })).toBe(false);
    });

    it('should return false for MEMBER role', () => {
      const context = { user: { role: Role.MEMBER } as any };
      expect(isOwner({ context })).toBe(false);
    });

    it('should return false when user is null', () => {
      const context = { user: null };
      expect(isOwner({ context })).toBe(false);
    });
  });

  describe('hasCompany', () => {
    it('should return true when company exists', () => {
      const context = { company: { id: 'company1' } as any };
      expect(hasCompany({ context })).toBe(true);
    });

    it('should return false when company is null', () => {
      const context = { company: null };
      expect(hasCompany({ context })).toBe(false);
    });
  });

  describe('canRetry', () => {
    it('should return true when retryCount is 0 and error is retryable', () => {
      const context = {
        retryCount: 0,
        error: { code: 'NETWORK_ERROR', message: 'test', retryable: true },
      };
      expect(canRetry({ context })).toBe(true);
    });

    it('should return true when retryCount is 0 and no error', () => {
      const context = { retryCount: 0, error: null };
      expect(canRetry({ context })).toBe(true);
    });

    it('should return false when retryCount reaches MAX_RETRY_COUNT', () => {
      const context = {
        retryCount: MAX_RETRY_COUNT,
        error: { code: 'NETWORK_ERROR', message: 'test', retryable: true },
      };
      expect(canRetry({ context })).toBe(false);
    });

    it('should return false when error is not retryable', () => {
      const context = {
        retryCount: 0,
        error: { code: 'INVALID_CREDENTIALS', message: 'test', retryable: false },
      };
      expect(canRetry({ context })).toBe(false);
    });
  });

  describe('MAX_RETRY_COUNT', () => {
    it('should be 3', () => {
      expect(MAX_RETRY_COUNT).toBe(3);
    });
  });

  describe('isRetryableError', () => {
    it('should return true when error is retryable', () => {
      const context = {
        error: { code: 'NETWORK_ERROR', message: 'test', retryable: true },
      };
      expect(isRetryableError({ context })).toBe(true);
    });

    it('should return false when error is not retryable', () => {
      const context = {
        error: { code: 'INVALID_CREDENTIALS', message: 'test', retryable: false },
      };
      expect(isRetryableError({ context })).toBe(false);
    });

    it('should return false when no error', () => {
      const context = { error: null };
      expect(isRetryableError({ context })).toBe(false);
    });
  });

  describe('Validation Guards', () => {
    describe('isValidEmail', () => {
      it('should return true for valid emails', () => {
        expect(isValidEmail('test@example.com')).toBe(true);
        expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
        expect(isValidEmail('user+tag@example.org')).toBe(true);
      });

      it('should return false for invalid emails', () => {
        expect(isValidEmail('')).toBe(false);
        expect(isValidEmail('notanemail')).toBe(false);
        expect(isValidEmail('missing@')).toBe(false);
        expect(isValidEmail('@nodomain.com')).toBe(false);
        expect(isValidEmail('spaces in@email.com')).toBe(false);
      });
    });

    describe('isValidPassword', () => {
      it('should return true for passwords >= 8 characters', () => {
        expect(isValidPassword('12345678')).toBe(true);
        expect(isValidPassword('password123')).toBe(true);
        expect(isValidPassword('a very long password')).toBe(true);
      });

      it('should return false for passwords < 8 characters', () => {
        expect(isValidPassword('')).toBe(false);
        expect(isValidPassword('1234567')).toBe(false);
        expect(isValidPassword('short')).toBe(false);
      });
    });

    describe('isNonEmpty', () => {
      it('should return true for non-empty strings', () => {
        expect(isNonEmpty('hello')).toBe(true);
        expect(isNonEmpty('  trimmed  ')).toBe(true);
        expect(isNonEmpty('a')).toBe(true);
      });

      it('should return false for empty or whitespace-only strings', () => {
        expect(isNonEmpty('')).toBe(false);
        expect(isNonEmpty('   ')).toBe(false);
        expect(isNonEmpty('\t\n')).toBe(false);
      });
    });
  });

  describe('Flow Guards', () => {
    describe('hasNoError', () => {
      it('should return true when error is null', () => {
        const context = { error: null };
        expect(hasNoError({ context })).toBe(true);
      });

      it('should return false when error exists', () => {
        const context = {
          error: { code: 'UNKNOWN', message: 'test', retryable: false },
        };
        expect(hasNoError({ context })).toBe(false);
      });
    });

    describe('hasFlowStarted', () => {
      it('should return true when flowStartedAt is set', () => {
        const context = { flowStartedAt: Date.now() };
        expect(hasFlowStarted({ context })).toBe(true);
      });

      it('should return false when flowStartedAt is null', () => {
        const context = { flowStartedAt: null };
        expect(hasFlowStarted({ context })).toBe(false);
      });
    });
  });

  describe('Guard Factory', () => {
    describe('hasErrorCode', () => {
      it('should create a guard that checks for specific error code', () => {
        const hasNetworkError = hasErrorCode('NETWORK_ERROR');

        const contextWithNetworkError = {
          error: { code: 'NETWORK_ERROR', message: 'test', retryable: true },
        };
        const contextWithOtherError = {
          error: { code: 'UNKNOWN', message: 'test', retryable: false },
        };
        const contextWithNoError = { error: null };

        expect(hasNetworkError({ context: contextWithNetworkError })).toBe(true);
        expect(hasNetworkError({ context: contextWithOtherError })).toBe(false);
        expect(hasNetworkError({ context: contextWithNoError })).toBe(false);
      });
    });

    describe('allOf', () => {
      it('should return true when all guards pass', () => {
        const guard1 = ({ context }: { context: { a: boolean } }) => context.a;
        const guard2 = ({ context }: { context: { b: boolean } }) => context.b;
        const combined = allOf<{ a: boolean; b: boolean }>(guard1, guard2);

        expect(combined({ context: { a: true, b: true } })).toBe(true);
      });

      it('should return false when any guard fails', () => {
        const guard1 = ({ context }: { context: { a: boolean } }) => context.a;
        const guard2 = ({ context }: { context: { b: boolean } }) => context.b;
        const combined = allOf<{ a: boolean; b: boolean }>(guard1, guard2);

        expect(combined({ context: { a: true, b: false } })).toBe(false);
        expect(combined({ context: { a: false, b: true } })).toBe(false);
        expect(combined({ context: { a: false, b: false } })).toBe(false);
      });
    });

    describe('anyOf', () => {
      it('should return true when any guard passes', () => {
        const guard1 = ({ context }: { context: { a: boolean } }) => context.a;
        const guard2 = ({ context }: { context: { b: boolean } }) => context.b;
        const combined = anyOf<{ a: boolean; b: boolean }>(guard1, guard2);

        expect(combined({ context: { a: true, b: false } })).toBe(true);
        expect(combined({ context: { a: false, b: true } })).toBe(true);
        expect(combined({ context: { a: true, b: true } })).toBe(true);
      });

      it('should return false when all guards fail', () => {
        const guard1 = ({ context }: { context: { a: boolean } }) => context.a;
        const guard2 = ({ context }: { context: { b: boolean } }) => context.b;
        const combined = anyOf<{ a: boolean; b: boolean }>(guard1, guard2);

        expect(combined({ context: { a: false, b: false } })).toBe(false);
      });
    });

    describe('not', () => {
      it('should negate a guard', () => {
        const isTrue = ({ context }: { context: { value: boolean } }) => context.value;
        const isFalse = not(isTrue);

        expect(isFalse({ context: { value: true } })).toBe(false);
        expect(isFalse({ context: { value: false } })).toBe(true);
      });
    });
  });
});

// =============================================================================
// Telemetry Tests
// =============================================================================

import {
  AUTH_TELEMETRY,
  emitTelemetry,
  calculateDuration,
  createTelemetryAction,
  createSuccessTelemetry,
  createFailureTelemetry,
  loginTelemetry,
  logoutTelemetry,
  registrationTelemetry,
  invitationTelemetry,
} from './telemetry';

describe('Shared Telemetry', () => {
  describe('AUTH_TELEMETRY constants', () => {
    it('should have login events', () => {
      expect(AUTH_TELEMETRY.LOGIN_STARTED).toBe('auth.login.started');
      expect(AUTH_TELEMETRY.LOGIN_SUCCESS).toBe('auth.login.success');
      expect(AUTH_TELEMETRY.LOGIN_FAILED).toBe('auth.login.failed');
    });

    it('should have logout events', () => {
      expect(AUTH_TELEMETRY.LOGOUT_STARTED).toBe('auth.logout.started');
      expect(AUTH_TELEMETRY.LOGOUT_COMPLETED).toBe('auth.logout.completed');
    });

    it('should have registration events', () => {
      expect(AUTH_TELEMETRY.REGISTRATION_STARTED).toBe('auth.registration.started');
      expect(AUTH_TELEMETRY.REGISTRATION_SUCCESS).toBe('auth.registration.success');
      expect(AUTH_TELEMETRY.REGISTRATION_FAILED).toBe('auth.registration.failed');
    });

    it('should have invitation events', () => {
      expect(AUTH_TELEMETRY.INVITATION_VIEWED).toBe('auth.invitation.viewed');
      expect(AUTH_TELEMETRY.INVITATION_ACCEPTED).toBe('auth.invitation.accepted');
      expect(AUTH_TELEMETRY.INVITATION_FAILED).toBe('auth.invitation.failed');
      expect(AUTH_TELEMETRY.INVITATION_CREATED).toBe('org.invitation.created');
      expect(AUTH_TELEMETRY.INVITATION_REVOKED).toBe('org.invitation.revoked');
    });

    it('should have session events', () => {
      expect(AUTH_TELEMETRY.SESSION_VALIDATED).toBe('auth.session.validated');
      expect(AUTH_TELEMETRY.SESSION_EXPIRED).toBe('auth.session.expired');
      expect(AUTH_TELEMETRY.SESSION_REFRESHED).toBe('auth.session.refreshed');
    });

    it('should have flow events', () => {
      expect(AUTH_TELEMETRY.FLOW_STARTED).toBe('auth.flow.started');
      expect(AUTH_TELEMETRY.FLOW_COMPLETED).toBe('auth.flow.completed');
      expect(AUTH_TELEMETRY.FLOW_FAILED).toBe('auth.flow.failed');
      expect(AUTH_TELEMETRY.FLOW_EXPIRED).toBe('auth.flow.expired');
    });
  });

  describe('calculateDuration', () => {
    it('should return undefined when flowStartedAt is null', () => {
      expect(calculateDuration(null)).toBeUndefined();
    });

    it('should calculate duration from start time', () => {
      const start = Date.now() - 1000; // 1 second ago
      const duration = calculateDuration(start);
      expect(duration).toBeGreaterThanOrEqual(1000);
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('emitTelemetry', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log telemetry event in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      emitTelemetry(AUTH_TELEMETRY.LOGIN_STARTED, { machineId: 'test' });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Telemetry]',
        'auth.login.started',
        { machineId: 'test' }
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should include all context properties in event', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      emitTelemetry(AUTH_TELEMETRY.LOGIN_FAILED, {
        machineId: 'login',
        duration: 500,
        errorCode: 'NETWORK_ERROR',
        metadata: { attempt: 1 },
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Telemetry]',
        'auth.login.failed',
        expect.objectContaining({
          machineId: 'login',
          duration: 500,
          errorCode: 'NETWORK_ERROR',
          metadata: { attempt: 1 },
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('createTelemetryAction', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should create an action that emits telemetry', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const action = createTelemetryAction('test-machine', AUTH_TELEMETRY.FLOW_STARTED);
      action({ context: { flowStartedAt: null } });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Telemetry]',
        'auth.flow.started',
        expect.objectContaining({ machineId: 'test-machine' })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should include duration when flowStartedAt is set', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const action = createTelemetryAction('test', AUTH_TELEMETRY.FLOW_COMPLETED);
      action({ context: { flowStartedAt: Date.now() - 100 } });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Telemetry]',
        'auth.flow.completed',
        expect.objectContaining({
          duration: expect.any(Number),
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should include custom metadata from getter', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const action = createTelemetryAction(
        'test',
        AUTH_TELEMETRY.FLOW_STARTED,
        (ctx: any) => ({ userId: ctx.userId })
      );
      action({ context: { flowStartedAt: null, userId: 'user123' } });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Telemetry]',
        'auth.flow.started',
        expect.objectContaining({
          metadata: { userId: 'user123' },
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('createFailureTelemetry', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should include error code and message', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const action = createFailureTelemetry('test', AUTH_TELEMETRY.LOGIN_FAILED);
      action({
        context: {
          flowStartedAt: null,
          error: { code: 'INVALID_CREDENTIALS', message: 'Wrong password' },
        },
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Telemetry]',
        'auth.login.failed',
        expect.objectContaining({
          errorCode: 'INVALID_CREDENTIALS',
          metadata: { errorMessage: 'Wrong password' },
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Pre-built Telemetry Actions', () => {
    it('should have login telemetry actions', () => {
      expect(loginTelemetry.started).toBeDefined();
      expect(loginTelemetry.success).toBeDefined();
      expect(loginTelemetry.failed).toBeDefined();
    });

    it('should have logout telemetry actions', () => {
      expect(logoutTelemetry.started).toBeDefined();
      expect(logoutTelemetry.completed).toBeDefined();
    });

    it('should have registration telemetry actions', () => {
      expect(registrationTelemetry.started).toBeDefined();
      expect(registrationTelemetry.success).toBeDefined();
      expect(registrationTelemetry.failed).toBeDefined();
    });

    it('should have invitation telemetry actions', () => {
      expect(invitationTelemetry.viewed).toBeDefined();
      expect(invitationTelemetry.accepted).toBeDefined();
      expect(invitationTelemetry.failed).toBeDefined();
    });
  });
});
