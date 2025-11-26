'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/auth/AuthLayout';
import KratosForm from '@/components/auth/KratosForm';
import { getVerificationFlow, getKratosBrowserUrl, isFlowExpiredError } from '@/lib/kratos';
import type { VerificationFlow } from '@/lib/kratos/types';
import { Loader2, CheckCircle } from 'lucide-react';

export default function VerificationPage() {
  const searchParams = useSearchParams();
  const [flow, setFlow] = useState<VerificationFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const flowId = searchParams.get('flow');

    // Helper to redirect to Kratos for a fresh flow
    function redirectToFreshFlow() {
      const kratosUrl = getKratosBrowserUrl();
      // Use replace() to avoid adding stale flow URLs to browser history
      window.location.replace(`${kratosUrl}/self-service/verification/browser`);
    }

    async function initFlow() {
      try {
        if (flowId) {
          // Get existing flow
          const existingFlow = await getVerificationFlow(flowId);
          setFlow(existingFlow);
        } else {
          // No flow ID - redirect to Kratos to create new flow
          redirectToFreshFlow();
          return;
        }
      } catch (err) {
        console.error('Failed to initialize verification flow:', err);
        // If flow is expired/invalid, create a fresh one instead of showing error
        if (isFlowExpiredError(err)) {
          redirectToFreshFlow();
          return;
        }
        setError('Failed to initialize email verification. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    initFlow();
  }, [searchParams]);

  if (loading) {
    return (
      <AuthLayout title="Verify Email" subtitle="Confirm your email address">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  if (error) {
    return (
      <AuthLayout title="Verify Email" subtitle="Confirm your email address">
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
      <AuthLayout title="Verify Email" subtitle="Confirm your email address">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  // Email verified successfully
  if (flow.state === 'passed_challenge') {
    return (
      <AuthLayout title="Email Verified" subtitle="Your email has been verified">
        <div className="text-center py-8">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <p className="text-slate-600 mb-6">
            Your email address has been verified successfully.
          </p>
          <Link
            href="/dashboard"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const subtitle =
    flow.state === 'sent_email'
      ? 'Check your email for the verification code'
      : 'Confirm your email address';

  return (
    <AuthLayout title="Verify Email" subtitle={subtitle}>
      <KratosForm ui={flow.ui} />

      {/* Links */}
      <div className="mt-6 text-center text-sm">
        <Link
          href="/dashboard"
          className="text-slate-500 hover:text-slate-700"
        >
          Skip for now
        </Link>
      </div>
    </AuthLayout>
  );
}
