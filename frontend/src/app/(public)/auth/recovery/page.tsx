'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/auth/AuthLayout';
import KratosForm from '@/components/auth/KratosForm';
import { getRecoveryFlow, getKratosBrowserUrl, isFlowExpiredError } from '@/lib/kratos';
import type { RecoveryFlow } from '@/lib/kratos/types';
import { Loader2 } from 'lucide-react';

export default function RecoveryPage() {
  const searchParams = useSearchParams();
  const [flow, setFlow] = useState<RecoveryFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const flowId = searchParams.get('flow');

    // Helper to redirect to Kratos for a fresh flow
    function redirectToFreshFlow() {
      const kratosUrl = getKratosBrowserUrl();
      // Use replace() to avoid adding stale flow URLs to browser history
      window.location.replace(`${kratosUrl}/self-service/recovery/browser`);
    }

    async function initFlow() {
      try {
        if (flowId) {
          // Get existing flow
          const existingFlow = await getRecoveryFlow(flowId);
          setFlow(existingFlow);
        } else {
          // No flow ID - redirect to Kratos to create new flow
          redirectToFreshFlow();
          return;
        }
      } catch (err) {
        console.error('Failed to initialize recovery flow:', err);
        // If flow is expired/invalid, create a fresh one instead of showing error
        if (isFlowExpiredError(err)) {
          redirectToFreshFlow();
          return;
        }
        setError('Failed to initialize password recovery. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    initFlow();
  }, [searchParams]);

  if (loading) {
    return (
      <AuthLayout title="Reset Password" subtitle="Enter your email to receive a recovery code">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  if (error) {
    return (
      <AuthLayout title="Reset Password" subtitle="Enter your email to receive a recovery code">
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
      <AuthLayout title="Reset Password" subtitle="Enter your email to receive a recovery code">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  const subtitle =
    flow.state === 'sent_email'
      ? 'Check your email for the recovery code'
      : 'Enter your email to receive a recovery code';

  return (
    <AuthLayout title="Reset Password" subtitle={subtitle}>
      <KratosForm ui={flow.ui} />

      {/* Links */}
      <div className="mt-6 text-center text-sm">
        <p className="text-slate-600">
          Remember your password?{' '}
          <Link
            href="/auth/login"
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
