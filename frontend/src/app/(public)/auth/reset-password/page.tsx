'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/auth/AuthLayout';
import KratosForm from '@/components/auth/KratosForm';
import { getSettingsFlow, isFlowExpiredError, createLogoutFlow, performLogout } from '@/lib/kratos';
import type { SettingsFlow } from '@/lib/kratos/types';
import { Loader2, CheckCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [flow, setFlow] = useState<SettingsFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const flowId = searchParams.get('flow');

    async function initFlow() {
      try {
        if (flowId) {
          const existingFlow = await getSettingsFlow(flowId);

          // Check if password was successfully updated (message ID 1050001)
          const passwordUpdated = existingFlow.ui?.messages?.some(
            (msg) => msg.id === 1050001
          );

          if (passwordUpdated) {
            setSuccess(true);
            // Clean up recovery flow flag
            sessionStorage.removeItem('recovery_flow');
            // Log out the user so they can log in with new password
            try {
              const logoutFlow = await createLogoutFlow();
              if (logoutFlow.logout_token) {
                await performLogout(logoutFlow.logout_token);
              }
            } catch {
              // Ignore logout errors - user will still see success message
            }
            setLoading(false);
            return;
          }

          // Check if this is from recovery flow (message ID 1060001)
          const isRecoveryFlow = existingFlow.ui?.messages?.some(
            (msg) => msg.id === 1060001
          );

          // If not from recovery, redirect to login
          if (!isRecoveryFlow && !passwordUpdated) {
            router.replace('/auth/login');
            return;
          }

          setFlow(existingFlow);
        } else {
          // No flow ID - redirect to login
          router.replace('/auth/login');
          return;
        }
      } catch (err) {
        console.error('Failed to initialize reset password flow:', err);
        if (isFlowExpiredError(err)) {
          setError('Your password reset session has expired. Please start over.');
        } else {
          setError('Failed to load password reset. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    }

    initFlow();
  }, [searchParams, router]);

  if (loading) {
    return (
      <AuthLayout title="Set New Password" subtitle="Create a new password for your account">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout title="Password Updated" subtitle="Your password has been successfully changed">
        <div className="text-center py-8">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <p className="text-slate-600 mb-6">
            Your password has been updated. Please sign in with your new password.
          </p>
          <Link
            href="/auth/login"
            className="inline-block w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors text-center"
          >
            Sign In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (error) {
    return (
      <AuthLayout title="Set New Password" subtitle="Create a new password for your account">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <Link
            href="/auth/recovery"
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Start password recovery again
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (!flow) {
    return (
      <AuthLayout title="Set New Password" subtitle="Create a new password for your account">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  // Clean up Kratos message formatting (e.g., "15.00 minutes" -> "15 minutes")
  const formattedUi = {
    ...flow.ui,
    messages: flow.ui.messages?.map((msg) => ({
      ...msg,
      text: msg.text.replace(/(\d+)\.00\s+(minutes?)/g, '$1 $2'),
    })),
  };

  return (
    <AuthLayout title="Set New Password" subtitle="Create a new password for your account">
      <KratosForm
        ui={formattedUi}
        onlyGroups={['password', 'default']}
        showPasswordConfirmation
      />

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
