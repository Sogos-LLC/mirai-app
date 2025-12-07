/**
 * Local Development URLs for k3d Cluster Testing
 *
 * These URLs point to the k3d cluster services exposed via HAProxy.
 * Override via environment variables if needed:
 * - FRONTEND_URL
 * - MARKETING_URL
 * - API_URL
 * - AUTH_URL
 */

export const LOCAL_URLS = {
  frontend: process.env.FRONTEND_URL || 'https://mirai.local',
  marketing: process.env.MARKETING_URL || 'https://get-mirai.local',
  api: process.env.API_URL || 'https://api.mirai.local',
  auth: process.env.AUTH_URL || 'https://auth.mirai.local',
} as const;

/**
 * Health check endpoints
 */
export const HEALTH_ENDPOINTS = {
  api: `${LOCAL_URLS.api}/health`,
  kratosWebauthn: `${LOCAL_URLS.auth}/.well-known/ory/webauthn.js`,
} as const;
