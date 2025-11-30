import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  AUTH_COOKIES,
  PROTECTED_ROUTES,
  PUBLIC_ROUTES,
  REDIRECT_URLS,
  REDIRECT_PARAMS,
  KRATOS_ENDPOINTS,
  extractSessionToken,
  isProtectedRoute,
  isPublicRoute,
} from '@/lib/auth.config';

/**
 * Middleware Configuration
 *
 * This middleware enforces the authentication contract defined in auth.config.ts:
 * - API flow sessions use ory_session_token cookie → sent as Authorization: Bearer
 * - Browser flow sessions use ory_kratos_session cookie → forwarded as Cookie header
 *
 * @see /src/lib/auth.config.ts for the central auth configuration
 */

// Environment configuration
const KRATOS_PUBLIC_URL = process.env.KRATOS_PUBLIC_URL || 'http://kratos-public.kratos.svc.cluster.local:80';
const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL || 'https://get-mirai.sogos.io';

/**
 * Check if user has valid session with Kratos
 *
 * Supports two authentication methods as per auth.config.ts:
 * 1. API flow: ory_session_token cookie → Authorization: Bearer header
 * 2. Browser flow: ory_kratos_session cookie → Cookie header
 */
async function checkSession(request: NextRequest): Promise<boolean> {
  try {
    const cookies = request.headers.get('cookie') || '';

    // Extract API flow session token using shared config
    const sessionToken = extractSessionToken(cookies);

    // Build headers for Kratos whoami request
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    // API flow: send session token as Bearer token
    // Browser flow: forward cookies (Kratos will read ory_kratos_session)
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    } else {
      headers['Cookie'] = cookies;
    }

    const response = await fetch(`${KRATOS_PUBLIC_URL}${KRATOS_ENDPOINTS.WHOAMI}`, {
      headers,
    });

    if (response.ok) {
      const session = await response.json();
      return session.active === true;
    }

    return false;
  } catch (error) {
    console.error('Session check failed:', error);
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // static files
  ) {
    return NextResponse.next();
  }

  // Check route types using shared config
  const isProtected = isProtectedRoute(pathname);
  const isPublic = isPublicRoute(pathname);

  // Root path - check session and redirect accordingly
  if (pathname === '/') {
    const hasSession = await checkSession(request);
    if (hasSession) {
      return NextResponse.redirect(new URL(REDIRECT_URLS.DASHBOARD, request.url));
    }
    // Redirect unauthenticated users to marketing site
    return NextResponse.redirect(LANDING_URL);
  }

  // Protected routes - require authentication
  if (isProtected) {
    const hasSession = await checkSession(request);
    if (!hasSession) {
      const loginUrl = new URL(REDIRECT_URLS.LOGIN, request.url);
      loginUrl.searchParams.set(REDIRECT_PARAMS.RETURN_TO, pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Auth pages - redirect to dashboard if already logged in
  if (isPublic && pathname.startsWith('/auth/')) {
    // Skip redirect for settings (requires auth anyway)
    if (pathname === '/auth/settings') {
      return NextResponse.next();
    }

    const hasSession = await checkSession(request);
    if (hasSession && (pathname === REDIRECT_URLS.LOGIN || pathname === REDIRECT_URLS.REGISTRATION)) {
      return NextResponse.redirect(new URL(REDIRECT_URLS.DASHBOARD, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|_next).*)',
  ],
};
