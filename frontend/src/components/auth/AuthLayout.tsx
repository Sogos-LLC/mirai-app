'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-page">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-8">
        <BookOpen className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />
        <span className="text-2xl font-bold text-primary">Mirai</span>
      </Link>

      {/* Card */}
      <div className="w-full max-w-md">
        <div className="bg-surface rounded-2xl shadow-xl border p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-primary mb-2">{title}</h1>
            {subtitle && <p className="text-secondary">{subtitle}</p>}
          </div>

          {/* Content */}
          {children}
        </div>
      </div>
    </div>
  );
}
