import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Marketing site middleware
 *
 * The marketing site (get-mirai.sogos.io) should ONLY serve:
 * - Landing page (/)
 * - Pricing (/pricing)
 * - Future: Blog, Docs, Help, etc.
 *
 * ALL auth and app routes redirect to the main app domain (mirai.sogos.io)
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://mirai.sogos.io';

  // Redirect ALL auth routes to main app domain
  // Marketing site should never handle authentication
  if (pathname.startsWith('/auth/')) {
    const url = new URL(pathname + request.nextUrl.search, appUrl);
    return NextResponse.redirect(url);
  }

  // Redirect any app routes to the main app
  const appPaths = [
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

  for (const path of appPaths) {
    if (pathname === path || pathname.startsWith(`${path}/`)) {
      return NextResponse.redirect(new URL(pathname, appUrl));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|_next).*)'],
};
