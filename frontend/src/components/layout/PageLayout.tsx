'use client';

import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import Sidebar from './Sidebar';
import Header from './Header';

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

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-20'
        }`}
      >
        <Header title={title} />

        <div className={noPadding ? '' : 'p-8'}>
		  <div
		    className={`${maxWidthClasses[maxWidth]} ${
    		  maxWidth === 'full' ? '' : 'mx-auto'
  		    }`}
		  >        
            {sidebarSlot ? (
              <div className="flex h-[calc(100vh-73px)]">
                {/* Page-level sidebar area */}
                <aside className="w-80 border-r border-gray-200 bg-primary-50 p-6 overflow-y-auto">
                  {sidebarSlot}
                </aside>

                {/* Main content area */}
                <section className="flex-1 bg-white p-6 overflow-y-auto">
                  {children}
                </section>
              </div>
            ) : (
              children
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

