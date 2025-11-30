'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { SignupWizard } from '@/components/auth/signup';

const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL || 'https://get-mirai.sogos.io';

// Note: Auth redirects for logged-in users are handled by middleware (server-side).
// No need for client-side session check here.

export default function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <a href={LANDING_URL} className="flex items-center gap-2 mb-8">
        <BookOpen className="h-10 w-10 text-indigo-600" />
        <span className="text-2xl font-bold text-slate-900">Mirai</span>
      </a>

      {/* Wizard Card */}
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <SignupWizard />
        </div>

        {/* Links */}
        <div className="mt-6 text-center text-sm">
          <p className="text-slate-600">
            Already have an account?{' '}
            <Link
              href="/auth/login"
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Terms */}
        <p className="mt-4 text-xs text-slate-500 text-center">
          By creating an account, you agree to our{' '}
          <a
            href={`${LANDING_URL}/terms`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-700"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href={`${LANDING_URL}/privacy`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-700"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
