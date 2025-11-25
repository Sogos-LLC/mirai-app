'use client';

import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

/**
 * Route layout for all pages in the (main) folder.
 * Provides the standard app shell with sidebar and header.
 * Individual pages should NOT wrap themselves in additional layouts.
 */
export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen } = useSelector((state: RootState) => state.ui);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-20'
        }`}
      >
        <Header />
        <div className="p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
