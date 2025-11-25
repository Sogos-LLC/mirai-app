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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-8">
        <BookOpen className="h-10 w-10 text-indigo-600" />
        <span className="text-2xl font-bold text-slate-900">Mirai</span>
      </Link>

      {/* Card */}
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">{title}</h1>
            {subtitle && <p className="text-slate-600">{subtitle}</p>}
          </div>

          {/* Content */}
          {children}
        </div>
      </div>
    </div>
  );
}
