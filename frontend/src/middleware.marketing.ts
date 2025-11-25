import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Marketing site middleware - minimal routing
 * Redirects authenticated routes to the main app domain
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Redirect any protected routes to the main app
  const protectedPaths = [
    '/dashboard',
    '/settings',
    '/teams',
    '/onboard',
    '/course-builder',
    '/content-library',
    '/templates',
    '/tutorials',
    '/help',
    '/updates',
    '/folder',
  ];

  for (const path of protectedPaths) {
    if (pathname === path || pathname.startsWith(`${path}/`)) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://mirai.sogos.io';
      return NextResponse.redirect(new URL(pathname, appUrl));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|_next).*)'],
};
