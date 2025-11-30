/**
 * Telemetry for State Machines
 *
 * Centralized telemetry event emission for all authentication
 * and organization state machines.
 *
 * Contract: All flows emit telemetry events at key transitions.
 */

// =============================================================================
// Telemetry Event Names
// =============================================================================

/**
 * Standard telemetry events emitted by auth/org machines
 */
export const AUTH_TELEMETRY = {
  // Login events
  LOGIN_STARTED: 'auth.login.started',
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILED: 'auth.login.failed',

  // Logout events
  LOGOUT_STARTED: 'auth.logout.started',
  LOGOUT_COMPLETED: 'auth.logout.completed',

  // Registration events
  REGISTRATION_STARTED: 'auth.registration.started',
  REGISTRATION_SUCCESS: 'auth.registration.success',
  REGISTRATION_FAILED: 'auth.registration.failed',

  // Invitation events
  INVITATION_VIEWED: 'auth.invitation.viewed',
  INVITATION_ACCEPTED: 'auth.invitation.accepted',
  INVITATION_FAILED: 'auth.invitation.failed',
  INVITATION_CREATED: 'org.invitation.created',
  INVITATION_REVOKED: 'org.invitation.revoked',

  // Session events
  SESSION_VALIDATED: 'auth.session.validated',
  SESSION_EXPIRED: 'auth.session.expired',
  SESSION_REFRESHED: 'auth.session.refreshed',

  // Flow events
  FLOW_STARTED: 'auth.flow.started',
  FLOW_COMPLETED: 'auth.flow.completed',
  FLOW_FAILED: 'auth.flow.failed',
  FLOW_EXPIRED: 'auth.flow.expired',
} as const;

export type TelemetryEventName = (typeof AUTH_TELEMETRY)[keyof typeof AUTH_TELEMETRY];

// =============================================================================
// Telemetry Context
// =============================================================================

/**
 * Common context included in all telemetry events
 */
export interface TelemetryContext {
  /** Machine that emitted the event */
  machineId: string;

  /** Current state when event was emitted */
  state?: string;

  /** Duration since flow started (ms) */
  duration?: number;

  /** Error code if applicable */
  errorCode?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Telemetry Emitter
// =============================================================================

/**
 * Emit a telemetry event
 *
 * Currently logs to console. In production, this would send
 * to an analytics service (e.g., Amplitude, Mixpanel, PostHog).
 */
export function emitTelemetry(eventName: TelemetryEventName, context: TelemetryContext): void {
  const event = {
    event: eventName,
    timestamp: Date.now(),
    ...context,
  };

  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Telemetry]', eventName, context);
  }

  // TODO: Send to analytics service in production
  // analytics.track(eventName, event);
}

// =============================================================================
// Telemetry Helpers
// =============================================================================

/**
 * Calculate duration from flow start time
 */
export function calculateDuration(flowStartedAt: number | null): number | undefined {
  if (!flowStartedAt) return undefined;
  return Date.now() - flowStartedAt;
}

/**
 * Create a telemetry action for XState entry/exit
 *
 * @example
 * entry: createTelemetryAction('login', AUTH_TELEMETRY.LOGIN_STARTED)
 */
export function createTelemetryAction(
  machineId: string,
  eventName: TelemetryEventName,
  getMetadata?: (context: unknown) => Record<string, unknown>
) {
  return ({ context }: { context: { flowStartedAt?: number | null } }) => {
    emitTelemetry(eventName, {
      machineId,
      duration: calculateDuration(context.flowStartedAt ?? null),
      metadata: getMetadata?.(context),
    });
  };
}

/**
 * Create success telemetry action
 */
export function createSuccessTelemetry(machineId: string, eventName: TelemetryEventName) {
  return createTelemetryAction(machineId, eventName);
}

/**
 * Create failure telemetry action with error context
 */
export function createFailureTelemetry(machineId: string, eventName: TelemetryEventName) {
  return ({
    context,
  }: {
    context: { flowStartedAt?: number | null; error?: { code: string; message: string } | null };
  }) => {
    emitTelemetry(eventName, {
      machineId,
      duration: calculateDuration(context.flowStartedAt ?? null),
      errorCode: context.error?.code,
      metadata: {
        errorMessage: context.error?.message,
      },
    });
  };
}

// =============================================================================
// Pre-built Telemetry Actions
// =============================================================================

/**
 * Login telemetry actions
 */
export const loginTelemetry = {
  started: createTelemetryAction('login', AUTH_TELEMETRY.LOGIN_STARTED),
  success: createSuccessTelemetry('login', AUTH_TELEMETRY.LOGIN_SUCCESS),
  failed: createFailureTelemetry('login', AUTH_TELEMETRY.LOGIN_FAILED),
};

/**
 * Logout telemetry actions
 */
export const logoutTelemetry = {
  started: createTelemetryAction('logout', AUTH_TELEMETRY.LOGOUT_STARTED),
  completed: createSuccessTelemetry('logout', AUTH_TELEMETRY.LOGOUT_COMPLETED),
};

/**
 * Registration telemetry actions
 */
export const registrationTelemetry = {
  started: createTelemetryAction('registration', AUTH_TELEMETRY.REGISTRATION_STARTED),
  success: createSuccessTelemetry('registration', AUTH_TELEMETRY.REGISTRATION_SUCCESS),
  failed: createFailureTelemetry('registration', AUTH_TELEMETRY.REGISTRATION_FAILED),
};

/**
 * Invitation telemetry actions
 */
export const invitationTelemetry = {
  viewed: createTelemetryAction('invitation', AUTH_TELEMETRY.INVITATION_VIEWED),
  accepted: createSuccessTelemetry('invitation', AUTH_TELEMETRY.INVITATION_ACCEPTED),
  failed: createFailureTelemetry('invitation', AUTH_TELEMETRY.INVITATION_FAILED),
};
