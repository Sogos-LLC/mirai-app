/**
 * Centralized URL Configuration
 *
 * This file is the SINGLE SOURCE OF TRUTH for all URL configuration.
 * All external URLs and cross-domain links MUST be imported from here.
 *
 * Environment Variables:
 * - NEXT_PUBLIC_APP_URL: Main application domain (mirai.local / mirai.sogos.io)
 * - NEXT_PUBLIC_API_URL: Backend API domain (api.mirai.local / mirai-api.sogos.io)
 * - NEXT_PUBLIC_LANDING_URL: Marketing site domain (get-mirai.local / get-mirai.sogos.io)
 * - NEXT_PUBLIC_KRATOS_BROWSER_URL: Kratos auth domain (auth.mirai.local / mirai-auth.sogos.io)
 *
 * Usage:
 *   import { APP_URL, LANDING_URL, buildAuthUrl } from '@/lib/urls';
 *   <a href={buildAuthUrl('/auth/login')}>Sign In</a>
 */

// =============================================================================
// External Service URLs
// =============================================================================

/**
 * Main application URL (frontend app)
 * Used for: Auth redirects from marketing site, cross-domain navigation
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mirai.sogos.io';

/**
 * Backend API URL
 * Used for: Connect-RPC calls, API requests
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://mirai-api.sogos.io';

/**
 * Marketing/Landing site URL
 * Used for: Post-logout redirects, "back to marketing" links
 */
export const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL || 'https://get-mirai.sogos.io';

/**
 * Kratos authentication service URL (browser-facing)
 * Used for: Direct Kratos API calls from browser
 */
export const KRATOS_BROWSER_URL =
  process.env.NEXT_PUBLIC_KRATOS_BROWSER_URL || 'https://mirai-auth.sogos.io';

// =============================================================================
// URL Builders
// =============================================================================

/**
 * Build a URL on the main app domain
 * @param path - Path to append (e.g., '/auth/login')
 * @returns Full URL (e.g., 'https://mirai.local/auth/login')
 */
export function buildAppUrl(path: string): string {
  return `${APP_URL}${path}`;
}

/**
 * Build an auth URL on the main app domain
 * Convenience wrapper for auth-related paths
 * @param authPath - Auth path (e.g., '/auth/login', '/auth/registration')
 * @returns Full URL
 */
export function buildAuthUrl(authPath: string): string {
  return buildAppUrl(authPath);
}

/**
 * Build a registration URL with optional tier parameter
 * @param tier - Optional pricing tier (starter, pro, enterprise)
 * @returns Full registration URL
 */
export function buildRegistrationUrl(tier?: string): string {
  const base = buildAppUrl('/auth/registration');
  if (tier) {
    return `${base}?tier=${tier}`;
  }
  return base;
}

/**
 * Build a URL on the landing/marketing site
 * @param path - Path to append (e.g., '/pricing', '/terms')
 * @returns Full URL
 */
export function buildLandingUrl(path: string = ''): string {
  return `${LANDING_URL}${path}`;
}

/**
 * Build a URL on the API domain
 * @param path - Path to append (e.g., '/health')
 * @returns Full URL
 */
export function buildApiUrl(path: string): string {
  return `${API_URL}${path}`;
}

/**
 * Build a Kratos URL for browser-based flows
 * @param path - Kratos endpoint path
 * @returns Full URL
 */
export function buildKratosUrl(path: string): string {
  return `${KRATOS_BROWSER_URL}${path}`;
}

// =============================================================================
// Common Auth URLs (convenience exports)
// =============================================================================

export const AUTH_URLS = {
  login: buildAppUrl('/auth/login'),
  registration: buildAppUrl('/auth/registration'),
  recovery: buildAppUrl('/auth/recovery'),
  settings: buildAppUrl('/auth/settings'),
} as const;

// =============================================================================
// Environment Detection (for debugging)
// =============================================================================

/**
 * Check if running in local development
 * Based on the APP_URL containing '.local' domain
 */
export function isLocalDevelopment(): boolean {
  return APP_URL.includes('.local') || APP_URL.includes('localhost');
}

/**
 * Get current environment name for debugging
 */
export function getEnvironmentName(): string {
  if (APP_URL.includes('.local')) return 'local-k3d';
  if (APP_URL.includes('localhost')) return 'local-dev';
  if (APP_URL.includes('sogos.io')) return 'production';
  return 'unknown';
}
