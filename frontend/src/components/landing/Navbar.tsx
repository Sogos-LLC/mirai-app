'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { buildAuthUrl } from '@/lib/urls';

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-md border-b border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xl font-bold text-primary">Mirai</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/pricing"
              className="text-secondary hover:text-primary font-medium transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="#features"
              className="text-secondary hover:text-primary font-medium transition-colors"
            >
              Features
            </Link>
          </div>

          {/* Auth Buttons - link to main app domain */}
          <div className="flex items-center gap-4">
            <a
              href={buildAuthUrl('/auth/login')}
              className="text-secondary hover:text-primary font-medium transition-colors"
            >
              Sign In
            </a>
            <a
              href={buildAuthUrl('/auth/registration')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Get Started
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}
