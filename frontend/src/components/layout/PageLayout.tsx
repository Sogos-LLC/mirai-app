'use client';

import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomTabNav from './BottomTabNav';

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';
  noPadding?: boolean;
  /** Optional per-page sidebar (e.g., folder tree in Content Library) */
  sidebarSlot?: React.ReactNode;
}

export default function PageLayout({
  children,
  title,
  maxWidth = '7xl',
  noPadding = false,
  sidebarSlot,
}: PageLayoutProps) {
  const { sidebarOpen } = useSelector((state: RootState) => state.ui);

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    full: 'max-w-full',
  };

  // Responsive margin: no margin on mobile, sidebar margin on desktop
  const marginClass = sidebarOpen ? 'md:ml-64' : 'md:ml-20';

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main
        className={`flex-1 transition-all duration-300 ${marginClass}`}
      >
        <Header title={title} />

        {/* Responsive padding: smaller on mobile, pb for bottom nav */}
        <div className={noPadding ? '' : 'p-4 md:p-6 lg:p-8 pb-20 md:pb-8'}>
          <div
            className={`${maxWidthClasses[maxWidth]} ${
              maxWidth === 'full' ? '' : 'mx-auto'
            }`}
          >
            {sidebarSlot ? (
              // Two-column layout with sidebar slot
              // Mobile: Stack vertically, Desktop: Side by side
              <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-73px)]">
                {/* Page-level sidebar area */}
                <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-gray-200 bg-primary-50 p-4 lg:p-6 overflow-y-auto max-h-64 lg:max-h-none">
                  {sidebarSlot}
                </aside>

                {/* Main content area */}
                <section className="flex-1 bg-white p-4 lg:p-6 overflow-y-auto">
                  {children}
                </section>
              </div>
            ) : (
              children
            )}
          </div>
        </div>
      </main>

      {/* Bottom navigation for mobile */}
      <BottomTabNav />
    </div>
  );
}

