import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/dashboard',
  '/course-builder',
  '/content-library',
  '/templates',
  '/tutorials',
  '/settings',
  '/help',
  '/updates',
  '/folder',
];

// Routes that are public (don't require auth)
const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/registration',
  '/auth/recovery',
  '/auth/verification',
  '/auth/error',
  '/pricing',
];

// Kratos session check endpoint
const KRATOS_PUBLIC_URL = process.env.KRATOS_PUBLIC_URL || 'http://kratos-public.kratos.svc.cluster.local:80';

// Marketing site URL for unauthenticated redirects
const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL || 'https://get-mirai.sogos.io';

/**
 * Check if user has valid session with Kratos
 */
async function checkSession(request: NextRequest): Promise<boolean> {
  try {
    // Get cookies from request
    const cookies = request.headers.get('cookie') || '';

    const response = await fetch(`${KRATOS_PUBLIC_URL}/sessions/whoami`, {
      headers: {
        Cookie: cookies,
        Accept: 'application/json',
      },
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

/**
 * Check if path matches any of the patterns
 */
function pathMatches(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith('/*')) {
      return pathname.startsWith(pattern.slice(0, -2));
    }
    return pathname === pattern || pathname.startsWith(`${pattern}/`);
  });
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

  // Check if it's a protected route
  const isProtectedRoute = pathMatches(pathname, PROTECTED_ROUTES);
  const isPublicRoute = pathMatches(pathname, PUBLIC_ROUTES);

  // Root path - check session and redirect accordingly
  if (pathname === '/') {
    const hasSession = await checkSession(request);
    if (hasSession) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    // Redirect unauthenticated users to marketing site
    return NextResponse.redirect(LANDING_URL);
  }

  // Protected routes - require authentication
  if (isProtectedRoute) {
    const hasSession = await checkSession(request);
    if (!hasSession) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('return_to', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Auth pages - redirect to dashboard if already logged in
  if (isPublicRoute && pathname.startsWith('/auth/')) {
    // Skip redirect for settings (requires auth anyway)
    if (pathname === '/auth/settings') {
      return NextResponse.next();
    }

    const hasSession = await checkSession(request);
    if (hasSession && (pathname === '/auth/login' || pathname === '/auth/registration')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
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
