'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/auth/AuthLayout';
import KratosForm from '@/components/auth/KratosForm';
import { getRegistrationFlow, getKratosBrowserUrl, getSession, isFlowExpiredError } from '@/lib/kratos';
import type { RegistrationFlow } from '@/lib/kratos/types';
import { Loader2 } from 'lucide-react';

export default function RegistrationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [flow, setFlow] = useState<RegistrationFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const flowId = searchParams.get('flow');
    const returnTo = searchParams.get('return_to');

    // Helper to redirect to Kratos for a fresh flow
    function redirectToFreshFlow() {
      const kratosUrl = getKratosBrowserUrl();
      const params = new URLSearchParams();
      if (returnTo) {
        params.set('return_to', returnTo);
      }
      // Use replace() to avoid adding stale flow URLs to browser history
      window.location.replace(`${kratosUrl}/self-service/registration/browser?${params.toString()}`);
    }

    async function initFlow() {
      try {
        // Check if user is already authenticated
        const session = await getSession();
        if (session?.active) {
          // Redirect away from registration page - use replace to not add to history
          router.replace(returnTo || '/dashboard');
          return;
        }

        if (flowId) {
          // Get existing flow
          const existingFlow = await getRegistrationFlow(flowId);
          setFlow(existingFlow);
        } else {
          // No flow ID - redirect to Kratos to create new flow
          redirectToFreshFlow();
          return;
        }
      } catch (err) {
        console.error('Failed to initialize registration flow:', err);
        // If flow is expired/invalid, create a fresh one instead of showing error
        if (isFlowExpiredError(err)) {
          redirectToFreshFlow();
          return;
        }
        setError('Failed to initialize registration. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    initFlow();
  }, [searchParams, router]);

  if (loading) {
    return (
      <AuthLayout title="Create Account" subtitle="Start your free trial">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  if (error) {
    return (
      <AuthLayout title="Create Account" subtitle="Start your free trial">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Try again
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (!flow) {
    return (
      <AuthLayout title="Create Account" subtitle="Start your free trial">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create Account" subtitle="Start your free trial">
      <KratosForm ui={flow.ui} showPasswordConfirmation />

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
      <p className="mt-6 text-xs text-slate-500 text-center">
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
    </AuthLayout>
  );
}
