'use client';

import React from 'react';

/**
 * Layout for public pages (landing, auth flows).
 * No sidebar, minimal chrome.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-dark-600 dark:to-dark-500">
      {children}
    </div>
  );
}
