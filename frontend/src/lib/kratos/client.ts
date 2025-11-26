/**
 * Ory Kratos client utilities
 */

import type {
  KratosSession,
  LoginFlow,
  RegistrationFlow,
  RecoveryFlow,
  VerificationFlow,
  SettingsFlow,
  LogoutFlow,
} from './types';

// Kratos URLs - use browser URL for redirects, internal URL for server-side
const KRATOS_BROWSER_URL = process.env.NEXT_PUBLIC_KRATOS_BROWSER_URL || 'https://mirai-auth.sogos.io';
const KRATOS_PUBLIC_URL = process.env.KRATOS_PUBLIC_URL || KRATOS_BROWSER_URL;

/**
 * Get the Kratos URL based on context (browser vs server)
 */
function getKratosUrl(forBrowser: boolean = true): string {
  return forBrowser ? KRATOS_BROWSER_URL : KRATOS_PUBLIC_URL;
}

/**
 * Fetch with credentials (cookies) included
 */
async function kratosRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  forBrowser: boolean = false
): Promise<T> {
  const baseUrl = getKratosUrl(forBrowser);
  const url = `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error?.message || error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check current session (whoami)
 */
export async function getSession(cookie?: string): Promise<KratosSession | null> {
  try {
    const headers: HeadersInit = {};
    if (cookie) {
      headers.Cookie = cookie;
    }

    const session = await kratosRequest<KratosSession>(
      '/sessions/whoami',
      { headers },
      !cookie // Use browser URL if no cookie provided (client-side)
    );

    return session;
  } catch {
    return null;
  }
}

/**
 * Initialize login flow
 */
export async function createLoginFlow(returnTo?: string): Promise<LoginFlow> {
  const params = new URLSearchParams();
  if (returnTo) {
    params.set('return_to', returnTo);
  }

  const query = params.toString();
  const endpoint = `/self-service/login/browser${query ? `?${query}` : ''}`;

  return kratosRequest<LoginFlow>(endpoint, {}, true);
}

/**
 * Get existing login flow
 */
export async function getLoginFlow(flowId: string, cookie?: string): Promise<LoginFlow> {
  const headers: HeadersInit = {};
  if (cookie) {
    headers.Cookie = cookie;
  }

  return kratosRequest<LoginFlow>(
    `/self-service/login/flows?id=${flowId}`,
    { headers },
    !cookie
  );
}

/**
 * Initialize registration flow
 */
export async function createRegistrationFlow(returnTo?: string): Promise<RegistrationFlow> {
  const params = new URLSearchParams();
  if (returnTo) {
    params.set('return_to', returnTo);
  }

  const query = params.toString();
  const endpoint = `/self-service/registration/browser${query ? `?${query}` : ''}`;

  return kratosRequest<RegistrationFlow>(endpoint, {}, true);
}

/**
 * Get existing registration flow
 */
export async function getRegistrationFlow(flowId: string, cookie?: string): Promise<RegistrationFlow> {
  const headers: HeadersInit = {};
  if (cookie) {
    headers.Cookie = cookie;
  }

  return kratosRequest<RegistrationFlow>(
    `/self-service/registration/flows?id=${flowId}`,
    { headers },
    !cookie
  );
}

/**
 * Initialize recovery flow
 */
export async function createRecoveryFlow(returnTo?: string): Promise<RecoveryFlow> {
  const params = new URLSearchParams();
  if (returnTo) {
    params.set('return_to', returnTo);
  }

  const query = params.toString();
  const endpoint = `/self-service/recovery/browser${query ? `?${query}` : ''}`;

  return kratosRequest<RecoveryFlow>(endpoint, {}, true);
}

/**
 * Get existing recovery flow
 */
export async function getRecoveryFlow(flowId: string, cookie?: string): Promise<RecoveryFlow> {
  const headers: HeadersInit = {};
  if (cookie) {
    headers.Cookie = cookie;
  }

  return kratosRequest<RecoveryFlow>(
    `/self-service/recovery/flows?id=${flowId}`,
    { headers },
    !cookie
  );
}

/**
 * Initialize verification flow
 */
export async function createVerificationFlow(returnTo?: string): Promise<VerificationFlow> {
  const params = new URLSearchParams();
  if (returnTo) {
    params.set('return_to', returnTo);
  }

  const query = params.toString();
  const endpoint = `/self-service/verification/browser${query ? `?${query}` : ''}`;

  return kratosRequest<VerificationFlow>(endpoint, {}, true);
}

/**
 * Get existing verification flow
 */
export async function getVerificationFlow(flowId: string, cookie?: string): Promise<VerificationFlow> {
  const headers: HeadersInit = {};
  if (cookie) {
    headers.Cookie = cookie;
  }

  return kratosRequest<VerificationFlow>(
    `/self-service/verification/flows?id=${flowId}`,
    { headers },
    !cookie
  );
}

/**
 * Initialize settings flow
 */
export async function createSettingsFlow(returnTo?: string): Promise<SettingsFlow> {
  const params = new URLSearchParams();
  if (returnTo) {
    params.set('return_to', returnTo);
  }

  const query = params.toString();
  const endpoint = `/self-service/settings/browser${query ? `?${query}` : ''}`;

  return kratosRequest<SettingsFlow>(endpoint, {}, true);
}

/**
 * Get existing settings flow
 */
export async function getSettingsFlow(flowId: string, cookie?: string): Promise<SettingsFlow> {
  const headers: HeadersInit = {};
  if (cookie) {
    headers.Cookie = cookie;
  }

  return kratosRequest<SettingsFlow>(
    `/self-service/settings/flows?id=${flowId}`,
    { headers },
    !cookie
  );
}

/**
 * Create logout flow
 */
export async function createLogoutFlow(cookie?: string): Promise<LogoutFlow> {
  const headers: HeadersInit = {};
  if (cookie) {
    headers.Cookie = cookie;
  }

  return kratosRequest<LogoutFlow>(
    '/self-service/logout/browser',
    { headers },
    !cookie
  );
}

/**
 * Perform logout
 */
export async function performLogout(logoutToken: string): Promise<void> {
  await kratosRequest(
    `/self-service/logout?token=${logoutToken}`,
    { method: 'GET' },
    true
  );
}

/**
 * Get Kratos browser URL for redirects
 */
export function getKratosBrowserUrl(): string {
  return KRATOS_BROWSER_URL;
}

/**
 * Check if an error indicates an expired or invalid flow
 * Kratos returns 410 Gone for expired flows, 404 for not found
 */
export function isFlowExpiredError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('410') ||
      message.includes('gone') ||
      message.includes('expired') ||
      message.includes('404') ||
      message.includes('not found')
    );
  }
  return false;
}
