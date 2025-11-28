'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/auth/AuthLayout';
import KratosForm from '@/components/auth/KratosForm';
import { getSettingsFlow, getKratosBrowserUrl, getSession, isFlowExpiredError } from '@/lib/kratos';
import type { SettingsFlow } from '@/lib/kratos/types';
import { Loader2, User, Lock, ArrowLeft } from 'lucide-react';

type SettingsTab = 'profile' | 'password';

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [flow, setFlow] = useState<SettingsFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  useEffect(() => {
    const flowId = searchParams.get('flow');

    // Helper to redirect to Kratos for a fresh flow
    function redirectToFreshFlow() {
      const kratosUrl = getKratosBrowserUrl();
      // Use replace() to avoid adding stale flow URLs to browser history
      window.location.replace(`${kratosUrl}/self-service/settings/browser`);
    }

    async function initFlow() {
      try {
        // Check if user is logged in
        const session = await getSession();
        if (!session) {
          // Use replace to not add to history
          router.replace('/auth/login?return_to=/auth/settings');
          return;
        }

        if (flowId) {
          // Get existing flow
          const existingFlow = await getSettingsFlow(flowId);

          // If this is from a recovery flow, redirect to dedicated reset-password page
          // Kratos message ID 1060001 = "You successfully recovered your account..."
          const isRecoveryFlow = existingFlow.ui?.messages?.some(
            (msg) => msg.id === 1060001
          );
          if (isRecoveryFlow) {
            // Mark that we're in recovery flow context
            sessionStorage.setItem('recovery_flow', 'true');
            router.replace(`/auth/reset-password?flow=${flowId}`);
            return;
          }

          // If password was just updated and we came from recovery flow,
          // redirect to reset-password to show success screen and logout
          // Kratos message ID 1050001 = "Your changes have been saved!"
          const passwordUpdated = existingFlow.ui?.messages?.some(
            (msg) => msg.id === 1050001
          );
          const fromRecovery = sessionStorage.getItem('recovery_flow') === 'true';
          if (passwordUpdated && fromRecovery) {
            sessionStorage.removeItem('recovery_flow');
            router.replace(`/auth/reset-password?flow=${flowId}`);
            return;
          }

          setFlow(existingFlow);
        } else {
          // No flow ID - redirect to Kratos to create new flow
          redirectToFreshFlow();
          return;
        }
      } catch (err) {
        console.error('Failed to initialize settings flow:', err);
        // If flow is expired/invalid, create a fresh one instead of showing error
        if (isFlowExpiredError(err)) {
          redirectToFreshFlow();
          return;
        }
        setError('Failed to load settings. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    initFlow();
  }, [searchParams, router]);

  if (loading) {
    return (
      <AuthLayout title="Account Settings" subtitle="Manage your account">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  if (error) {
    return (
      <AuthLayout title="Account Settings" subtitle="Manage your account">
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
      <AuthLayout title="Account Settings" subtitle="Manage your account">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType; groups: string[] }[] = [
    { id: 'profile', label: 'Profile', icon: User, groups: ['profile'] },
    { id: 'password', label: 'Password', icon: Lock, groups: ['password'] },
  ];

  const activeTabConfig = tabs.find((t) => t.id === activeTab);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="px-8 py-6 border-b border-slate-200">
            <h1 className="text-2xl font-bold text-slate-900">Account Settings</h1>
            <p className="text-slate-600 mt-1">Manage your profile and security settings</p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-8">
            <KratosForm
              ui={flow.ui}
              onlyGroups={activeTabConfig?.groups}
              showPasswordConfirmation={activeTab === 'password'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
