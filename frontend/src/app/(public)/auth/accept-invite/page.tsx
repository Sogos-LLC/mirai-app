'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthLayout from '@/components/auth/AuthLayout';
import { useInvitationAccept } from '@/hooks/useInvitationAccept';
import { useInvitedUserRegistration } from '@/hooks/useInvitedUserRegistration';
import { ERROR_MESSAGES } from '@/machines/shared/types';
import { Loader2, Building2, Mail, AlertCircle, UserPlus, LogIn, CheckCircle, Eye, EyeOff } from 'lucide-react';

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  // Use the original invitation accept hook to check auth state
  const invitationAccept = useInvitationAccept();

  // Use the new invited user registration hook for inline registration
  const invitedUser = useInvitedUserRegistration();

  // Local form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState({ firstName: false, lastName: false, password: false, confirmPassword: false });

  // Start the original flow on mount to check auth state
  useEffect(() => {
    if (token) {
      invitationAccept.start(token);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the invited user registration flow when we know auth is needed
  useEffect(() => {
    if (invitationAccept.isNeedsAuth && token && invitedUser.isIdle) {
      invitedUser.start(token);
    }
  }, [invitationAccept.isNeedsAuth, token, invitedUser.isIdle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update form state in the machine whenever local state changes
  useEffect(() => {
    if (invitedUser.isCollectingInfo) {
      invitedUser.setForm(firstName, lastName, password);
    }
  }, [firstName, lastName, password, invitedUser.isCollectingInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Validation
  const isFirstNameValid = firstName.trim().length > 0;
  const isLastNameValid = lastName.trim().length > 0;
  const isPasswordValid = password.length >= 8;
  const isConfirmPasswordValid = confirmPassword.length > 0 && confirmPassword === password;
  const passwordsMatch = password === confirmPassword;
  const canSubmit = isFirstNameValid && isLastNameValid && isPasswordValid && isConfirmPasswordValid;

  // No token provided
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

  // Loading state (checking auth)
  if (invitationAccept.isLoading) {
    return (
      <AuthLayout title="Loading Invitation" subtitle="Please wait...">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  // Error state from invitation accept (before we know auth state)
  if (invitationAccept.isError && invitationAccept.error) {
    const errorMessage = ERROR_MESSAGES[invitationAccept.error.code as keyof typeof ERROR_MESSAGES] || invitationAccept.error.message;

    return (
      <AuthLayout title="Invitation Error" subtitle="We couldn't process this invitation">
        <div className="text-center py-6">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{errorMessage}</p>
          {invitationAccept.error.retryable && (
            <button
              onClick={invitationAccept.retry}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Try again
            </button>
          )}
        </div>
      </AuthLayout>
    );
  }

  // Error state from invited user registration
  if (invitedUser.isError && invitedUser.error) {
    const errorMessage = ERROR_MESSAGES[invitedUser.error.code as keyof typeof ERROR_MESSAGES] || invitedUser.error.message;

    return (
      <AuthLayout title="Registration Error" subtitle="We couldn't complete your registration">
        <div className="text-center py-6">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{errorMessage}</p>
          {invitedUser.error.retryable && (
            <button
              onClick={invitedUser.retry}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Try again
            </button>
          )}
        </div>
      </AuthLayout>
    );
  }

  // Success - accepted (for already authenticated users)
  if (invitationAccept.isAccepted) {
    return (
      <AuthLayout title="Welcome!" subtitle="You've joined the team">
        <div className="text-center py-6">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-slate-600 mb-2">
            You&apos;ve successfully joined <strong>{invitationAccept.companyName}</strong>!
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

  // Success - registered and accepted (for new users via inline registration)
  // The hook handles redirect to dashboard with ?welcome=true
  // Show a brief loading state while redirecting
  if (invitedUser.isSuccess) {
    return (
      <AuthLayout title="Success!" subtitle="Redirecting...">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  // Email mismatch - logged in with different email
  if (invitationAccept.isEmailMismatch) {
    return (
      <AuthLayout
        title="Email Mismatch"
        subtitle={`Invitation for ${invitationAccept.inviteeEmail}`}
      >
        <div className="space-y-6">
          <InvitationDetails
            companyName={invitationAccept.companyName}
            inviteeEmail={invitationAccept.inviteeEmail}
          />

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-amber-800 font-medium">
                  You&apos;re signed in as {invitationAccept.sessionEmail}
                </p>
                <p className="text-amber-700 mt-1">
                  This invitation was sent to {invitationAccept.inviteeEmail}. Please sign in with the correct account or create a new account.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={invitationAccept.goToLogin}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <LogIn className="h-5 w-5" />
              Sign in as {invitationAccept.inviteeEmail}
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Needs authentication - show inline registration form
  if (invitationAccept.isNeedsAuth) {
    const isFormLoading = invitedUser.isFetchingInvitation || invitedUser.isSubmitting;

    return (
      <AuthLayout
        title="Create Account"
        subtitle={`Join ${invitedUser.companyName || invitationAccept.companyName || 'the team'}`}
      >
        <div className="space-y-6">
          {/* Loading state for fetching invitation in invited user flow */}
          {invitedUser.isFetchingInvitation && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          )}

          {/* Registration form */}
          {invitedUser.isCollectingInfo && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) {
                  invitedUser.submit();
                }
              }}
              className="space-y-4"
            >
              {/* Name fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, firstName: true }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                      touched.firstName && !isFirstNameValid ? 'border-red-300' : 'border-slate-300'
                    }`}
                    placeholder="John"
                    disabled={isFormLoading}
                  />
                  {touched.firstName && !isFirstNameValid && (
                    <p className="mt-1 text-xs text-red-600">First name is required</p>
                  )}
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, lastName: true }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                      touched.lastName && !isLastNameValid ? 'border-red-300' : 'border-slate-300'
                    }`}
                    placeholder="Doe"
                    disabled={isFormLoading}
                  />
                  {touched.lastName && !isLastNameValid && (
                    <p className="mt-1 text-xs text-red-600">Last name is required</p>
                  )}
                </div>
              </div>

              {/* Email field (read-only) */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={invitedUser.inviteeEmail || invitationAccept.inviteeEmail || ''}
                  readOnly
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-slate-500">This email was specified in your invitation</p>
              </div>

              {/* Password field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                    className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                      touched.password && !isPasswordValid ? 'border-red-300' : 'border-slate-300'
                    }`}
                    placeholder="Create a password"
                    disabled={isFormLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {touched.password && !isPasswordValid && (
                  <p className="mt-1 text-xs text-red-600">Password must be at least 8 characters</p>
                )}
                {!touched.password && (
                  <p className="mt-1 text-xs text-slate-500">Minimum 8 characters</p>
                )}
              </div>

              {/* Confirm Password field */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
                    className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                      touched.confirmPassword && !passwordsMatch ? 'border-red-300' : 'border-slate-300'
                    }`}
                    placeholder="Confirm your password"
                    disabled={isFormLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {touched.confirmPassword && !passwordsMatch && (
                  <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
                )}
              </div>

              {/* Error message */}
              {invitedUser.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{invitedUser.error.message}</p>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={!canSubmit || isFormLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {invitedUser.isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-5 w-5" />
                    Create Account & Join
                  </>
                )}
              </button>
            </form>
          )}

          {/* Submitting state */}
          {invitedUser.isSubmitting && (
            <div className="flex flex-col items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mb-2" />
              <p className="text-sm text-slate-600">Creating your account...</p>
            </div>
          )}
        </div>
      </AuthLayout>
    );
  }

  // Authenticated - can accept directly
  if (invitationAccept.isAuthenticated) {
    return (
      <AuthLayout
        title="Accept Invitation"
        subtitle={`Join ${invitationAccept.companyName || 'the team'}`}
      >
        <div className="space-y-6">
          <InvitationDetails
            companyName={invitationAccept.companyName}
            inviteeEmail={invitationAccept.inviteeEmail}
          />

          <button
            onClick={invitationAccept.accept}
            disabled={invitationAccept.isAccepting}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {invitationAccept.isAccepting ? (
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
