'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/auth/AuthLayout';
import KratosForm from '@/components/auth/KratosForm';
import { getLoginFlow, createLoginFlow, getKratosBrowserUrl } from '@/lib/kratos';
import type { LoginFlow } from '@/lib/kratos/types';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [flow, setFlow] = useState<LoginFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const flowId = searchParams.get('flow');
    const returnTo = searchParams.get('return_to');

    async function initFlow() {
      try {
        if (flowId) {
          // Get existing flow
          const existingFlow = await getLoginFlow(flowId);
          setFlow(existingFlow);
        } else {
          // Create new flow - redirect to Kratos
          const kratosUrl = getKratosBrowserUrl();
          const params = new URLSearchParams();
          if (returnTo) {
            params.set('return_to', returnTo);
          }
          window.location.href = `${kratosUrl}/self-service/login/browser?${params.toString()}`;
          return;
        }
      } catch (err) {
        console.error('Failed to initialize login flow:', err);
        setError('Failed to initialize login. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    initFlow();
  }, [searchParams]);

  if (loading) {
    return (
      <AuthLayout title="Sign In" subtitle="Welcome back">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  if (error) {
    return (
      <AuthLayout title="Sign In" subtitle="Welcome back">
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
      <AuthLayout title="Sign In" subtitle="Welcome back">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign In" subtitle="Welcome back">
      <KratosForm ui={flow.ui} />

      {/* Links */}
      <div className="mt-6 space-y-3 text-center text-sm">
        <p className="text-slate-600">
          Don&apos;t have an account?{' '}
          <Link
            href="/auth/registration"
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Sign up
          </Link>
        </p>
        <p>
          <Link
            href="/auth/recovery"
            className="text-slate-500 hover:text-slate-700"
          >
            Forgot your password?
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
