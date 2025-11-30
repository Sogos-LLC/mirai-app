'use client';

import React, { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthLayout from '@/components/auth/AuthLayout';
import { useInvitationAccept } from '@/hooks/useInvitationAccept';
import { ERROR_MESSAGES } from '@/machines/shared/types';
import { Loader2, Building2, Mail, AlertCircle, UserPlus, LogIn, CheckCircle } from 'lucide-react';

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const {
    // State
    isLoading,
    isNeedsAuth,
    isEmailMismatch,
    isAuthenticated,
    isAccepting,
    isAccepted,
    isError,

    // Data
    invitation,
    company,
    error,

    // Computed
    inviteeEmail,
    companyName,
    sessionEmail,

    // Actions
    start,
    accept,
    goToRegister,
    goToLogin,
    retry,
  } = useInvitationAccept();

  // Start the flow on mount
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      start(token);
    }
  }, [searchParams, start]);

  // No token provided
  const token = searchParams.get('token');
  if (!token) {
    return (
      <AuthLayout title="Invalid Link" subtitle="No invitation token provided">
        <div className="text-center py-6">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-600 mb-4">
            This invitation link appears to be invalid or incomplete.
          </p>
          <p className="text-sm text-slate-500">
            Please check your email for the correct invitation link.
          </p>
        </div>
      </AuthLayout>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <AuthLayout title="Loading Invitation" subtitle="Please wait...">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  // Error state
  if (isError && error) {
    const errorMessage = ERROR_MESSAGES[error.code as keyof typeof ERROR_MESSAGES] || error.message;

    return (
      <AuthLayout title="Invitation Error" subtitle="We couldn't process this invitation">
        <div className="text-center py-6">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{errorMessage}</p>
          {error.retryable && (
            <button
              onClick={retry}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Try again
            </button>
          )}
        </div>
      </AuthLayout>
    );
  }

  // Accepted - success!
  if (isAccepted) {
    return (
      <AuthLayout title="Welcome!" subtitle="You've joined the team">
        <div className="text-center py-6">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-slate-600 mb-2">
            You&apos;ve successfully joined <strong>{companyName}</strong>!
          </p>
          <p className="text-sm text-slate-500">
            Redirecting to dashboard...
          </p>
          <div className="mt-4">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600 mx-auto" />
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Email mismatch - logged in with different email
  if (isEmailMismatch) {
    return (
      <AuthLayout
        title="Email Mismatch"
        subtitle={`Invitation for ${inviteeEmail}`}
      >
        <div className="space-y-6">
          {/* Invitation details */}
          <InvitationDetails
            companyName={companyName}
            inviteeEmail={inviteeEmail}
          />

          {/* Warning */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-amber-800 font-medium">
                  You&apos;re signed in as {sessionEmail}
                </p>
                <p className="text-amber-700 mt-1">
                  This invitation was sent to {inviteeEmail}. Please sign in with the correct account or create a new account.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={goToLogin}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <LogIn className="h-5 w-5" />
              Sign in as {inviteeEmail}
            </button>
            <button
              onClick={goToRegister}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
            >
              <UserPlus className="h-5 w-5" />
              Create account with {inviteeEmail}
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Needs authentication
  if (isNeedsAuth) {
    return (
      <AuthLayout
        title="Accept Invitation"
        subtitle={`Join ${companyName || 'the team'}`}
      >
        <div className="space-y-6">
          {/* Invitation details */}
          <InvitationDetails
            companyName={companyName}
            inviteeEmail={inviteeEmail}
          />

          {/* Actions */}
          <div className="space-y-3">
            <p className="text-sm text-slate-600 text-center">
              Sign in or create an account to accept this invitation
            </p>
            <button
              onClick={goToRegister}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <UserPlus className="h-5 w-5" />
              Create Account
            </button>
            <button
              onClick={goToLogin}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
            >
              <LogIn className="h-5 w-5" />
              Sign In
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Authenticated - can accept
  if (isAuthenticated) {
    return (
      <AuthLayout
        title="Accept Invitation"
        subtitle={`Join ${companyName || 'the team'}`}
      >
        <div className="space-y-6">
          {/* Invitation details */}
          <InvitationDetails
            companyName={companyName}
            inviteeEmail={inviteeEmail}
          />

          {/* Accept button */}
          <button
            onClick={accept}
            disabled={isAccepting}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAccepting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5" />
                Accept Invitation
              </>
            )}
          </button>
        </div>
      </AuthLayout>
    );
  }

  // Fallback loading state
  return (
    <AuthLayout title="Loading..." subtitle="Please wait">
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    </AuthLayout>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

interface InvitationDetailsProps {
  companyName: string | null;
  inviteeEmail: string | null;
}

function InvitationDetails({ companyName, inviteeEmail }: InvitationDetailsProps) {
  return (
    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
      {companyName && (
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-slate-400 flex-shrink-0" />
          <div>
            <p className="text-xs text-slate-500">Company</p>
            <p className="font-medium text-slate-900">{companyName}</p>
          </div>
        </div>
      )}
      {inviteeEmail && (
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-slate-400 flex-shrink-0" />
          <div>
            <p className="text-xs text-slate-500">Invited Email</p>
            <p className="font-medium text-slate-900">{inviteeEmail}</p>
          </div>
        </div>
      )}
    </div>
  );
}
