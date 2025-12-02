'use client';

import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useRouter, useSearchParams } from 'next/navigation';
import { RootState, AppDispatch } from '@/store';
import { checkSession, selectIsAuthInitialized } from '@/store/slices/authSlice';
import { prefetchFolders, prefetchCourses } from '@/store/slices/courseSlice';
import { setSessionTokenCookie } from '@/lib/auth.config';
import Sidebar, { menuItems, bottomItems } from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import BottomTabNav from '@/components/layout/BottomTabNav';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { useIsMobile } from '@/hooks/useBreakpoint';

/**
 * Route layout for all pages in the (main) folder.
 * Provides the standard app shell with sidebar and header.
 * Individual pages should NOT wrap themselves in additional layouts.
 *
 * Mobile devices: Drawer sidebar, bottom nav, extra padding
 * Desktop: Fixed sidebar with collapsible margin, no bottom nav
 */
export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();
  const { sidebarOpen } = useSelector((state: RootState) => state.ui);
  const isAuthInitialized = useSelector(selectIsAuthInitialized);
  const isMobile = useIsMobile();
  const [tokenProcessed, setTokenProcessed] = useState(false);

  // Handle auth_token from URL (e.g., Stripe checkout redirect) BEFORE checking session
  useEffect(() => {
    const authToken = searchParams.get('auth_token');
    if (authToken) {
      console.log('[Layout] Setting session token from URL param');
      setSessionTokenCookie(authToken);
    }
    setTokenProcessed(true);
  }, [searchParams]);

  // Initialize auth AFTER token is processed
  useEffect(() => {
    if (!tokenProcessed) return;

    // Check auth session
    if (!isAuthInitialized) {
      dispatch(checkSession());
    }
  }, [dispatch, isAuthInitialized, tokenProcessed]);

  // Prefetch routes and API data only AFTER auth is initialized
  useEffect(() => {
    if (!isAuthInitialized) return;

    // Prefetch all sidebar routes for instant navigation
    const allPaths = [
      '/dashboard',
      ...menuItems.map((item) => item.path),
      ...bottomItems.map((item) => item.path),
    ];

    // In development, fetch pages to trigger compilation
    // In production, router.prefetch is sufficient
    if (process.env.NODE_ENV === 'development') {
      allPaths.forEach((path) => {
        fetch(path, { priority: 'low' } as RequestInit).catch(() => {});
      });
    }
    allPaths.forEach((path) => router.prefetch(path));

    // Prefetch API data - only after auth is ready
    dispatch(prefetchFolders(true));
    dispatch(prefetchCourses());
  }, [router, dispatch, isAuthInitialized]);

  // Desktop: sidebar margin based on collapsed/expanded state
  // Mobile: no margin (sidebar is a drawer overlay)
  const marginClass = isMobile
    ? ''
    : sidebarOpen
      ? 'ml-64'
      : 'ml-20';

  // Desktop: standard padding
  // Mobile: extra bottom padding for bottom nav
  const paddingClass = isMobile
    ? 'p-4 pb-24'
    : 'p-6 lg:p-8';

  // Show loading screen while processing token or auth initializes
  if (!tokenProcessed || !isAuthInitialized) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className={`flex-1 transition-all duration-300 ${marginClass}`}
      >
        <Header />
        {/* Content area */}
        <div className={paddingClass}>
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>

      {/* Bottom navigation for mobile devices only */}
      {isMobile && <BottomTabNav />}
    </div>
  );
}
