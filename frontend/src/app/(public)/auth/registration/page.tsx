'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Loader2, AlertCircle } from 'lucide-react';
import { SignupWizard } from '@/components/auth/signup';
import { getSession } from '@/lib/kratos';

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      try {
        const session = await getSession();
        if (session?.active) {
          // Already logged in - go to dashboard
          router.replace('/dashboard');
          return;
        }
      } catch (err) {
        console.error('[SignupPage] Session check failed:', err);
        setError('Unable to verify session. Please try again.');
      }
      setLoading(false);
    }
    checkSession();
  }, []); // Run only once on mount

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-red-600 mb-4 text-center">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-8">
        <BookOpen className="h-10 w-10 text-indigo-600" />
        <span className="text-2xl font-bold text-slate-900">Mirai</span>
      </Link>

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
          <Link href="/terms" className="underline hover:text-slate-700">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-slate-700">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
