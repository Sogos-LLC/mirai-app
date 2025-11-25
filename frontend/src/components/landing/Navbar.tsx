'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

// App URL for auth redirects (marketing site should send users to main app for login)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mirai.sogos.io';

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-indigo-600" />
            <span className="text-xl font-bold text-slate-900">Mirai</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/pricing"
              className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="#features"
              className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              Features
            </Link>
          </div>

          {/* Auth Buttons - link to main app domain */}
          <div className="flex items-center gap-4">
            <a
              href={`${APP_URL}/auth/login`}
              className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              Sign In
            </a>
            <a
              href={`${APP_URL}/auth/registration`}
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
