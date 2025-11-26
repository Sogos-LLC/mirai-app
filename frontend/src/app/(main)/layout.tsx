'use client';

import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import BottomTabNav from '@/components/layout/BottomTabNav';
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
  const { sidebarOpen } = useSelector((state: RootState) => state.ui);
  const isMobile = useIsMobile();

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
