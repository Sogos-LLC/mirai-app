'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { SignupWizard } from '@/components/auth/signup';
import { buildLandingUrl } from '@/lib/urls';

// Note: Auth redirects for logged-in users are handled by middleware (server-side).
// No need for client-side session check here.

export default function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <a href={buildLandingUrl()} className="flex items-center gap-2 mb-8">
        <BookOpen className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />
        <span className="text-2xl font-bold text-primary">Mirai</span>
      </a>

      {/* Wizard Card */}
      <div className="w-full max-w-4xl">
        <SignupWizard />

        {/* Links */}
        <div className="mt-6 text-center text-sm">
          <p className="text-secondary">
            Already have an account?{' '}
            <Link
              href="/auth/login"
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Terms */}
        <p className="mt-4 text-xs text-muted text-center">
          By creating an account, you agree to our{' '}
          <a
            href={buildLandingUrl('/terms')}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-secondary"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href={buildLandingUrl('/privacy')}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-secondary"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
