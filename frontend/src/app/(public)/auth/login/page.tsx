'use client';

import React, { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/auth/AuthLayout';
import KratosForm from '@/components/auth/KratosForm';
import { useLogin } from '@/hooks/useLogin';
import { Loader2, CheckCircle } from 'lucide-react';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const {
    isLoading,
    isReady,
    isError,
    flow,
    error,
    checkoutSuccess,
    start,
    retry,
  } = useLogin();

  // Start the login flow on mount
  useEffect(() => {
    const flowId = searchParams.get('flow') || undefined;
    const returnTo = searchParams.get('return_to') || undefined;
    const checkout = searchParams.get('checkout') === 'success';

    start({ flowId, returnTo, checkoutSuccess: checkout });
  }, [searchParams, start]);

  // Loading state
  if (isLoading) {
    return (
      <AuthLayout title="Sign In" subtitle="Welcome back">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  // Error state
  if (isError && error) {
    return (
      <AuthLayout title="Sign In" subtitle="Welcome back">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error.message}</p>
          <button
            onClick={retry}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Try again
          </button>
        </div>
      </AuthLayout>
    );
  }

  // Waiting for flow (redirecting to Kratos or loading)
  if (!isReady || !flow) {
    return (
      <AuthLayout title="Sign In" subtitle="Welcome back">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  // Ready - show login form
  return (
    <AuthLayout title="Sign In" subtitle="Welcome back">
      {/* Checkout success message */}
      {checkoutSuccess && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-green-800 dark:text-green-400 font-medium">Payment successful!</p>
            <p className="text-green-700 dark:text-green-500 text-sm">Sign in with your credentials to access your account.</p>
          </div>
        </div>
      )}

      <KratosForm ui={flow.ui} />

      {/* Links */}
      <div className="mt-6 space-y-3 text-center text-sm">
        <p className="text-secondary">
          Don&apos;t have an account?{' '}
          <Link
            href="/auth/registration"
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
          >
            Sign up
          </Link>
        </p>
        <p>
          <Link
            href="/auth/recovery"
            className="text-muted hover:text-secondary"
          >
            Forgot your password?
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
