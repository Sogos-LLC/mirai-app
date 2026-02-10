'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Shield, Mail, KeyRound, Loader2, AlertCircle, Clock } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  useVerifyShareToken,
  useSendVerificationCode,
  useVerifyEmailCode,
} from '@/hooks/useShareViewer';
import { useShareSession } from '@/store/zustand/shareSession';
import { ShareLinkStatus } from '@/gen/mirai/v1/course_share_pb';

type Step = 'loading' | 'invalid' | 'pending' | 'failed' | 'email' | 'code' | 'verified';

export default function ShareVerificationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [step, setStep] = useState<Step>('loading');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { setSession } = useShareSession();
  const { data: tokenData, isLoading: tokenLoading, refetch } =
    useVerifyShareToken(token);
  const sendCode = useSendVerificationCode();
  const verifyCode = useVerifyEmailCode();

  // Determine step from token verification
  useEffect(() => {
    if (tokenLoading) return;

    if (!tokenData?.valid) {
      setStep('invalid');
      return;
    }

    const status = tokenData.status;
    if (status === ShareLinkStatus.PENDING || status === ShareLinkStatus.SNAPSHOTTING) {
      setStep('pending');
    } else if (status === ShareLinkStatus.READY) {
      setStep('email');
    } else if (status === ShareLinkStatus.FAILED) {
      setStep('failed');
    } else {
      setStep('invalid');
    }
  }, [tokenLoading, tokenData]);

  // Poll while pending
  useEffect(() => {
    if (step === 'pending') {
      pollRef.current = setInterval(() => {
        refetch();
      }, 3000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [step, refetch]);

  const handleSendCode = async () => {
    setError('');
    try {
      const result = await sendCode.mutate({ token, email });
      if (result.sent) {
        setStep('code');
      } else {
        setError('Email not authorized for this share link.');
      }
    } catch {
      setError('Failed to send verification code.');
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    try {
      const result = await verifyCode.mutate({ token, email, code });
      if (result.sessionToken) {
        setSession(result.sessionToken, email, result.courseTitle);
        setStep('verified');
        router.push(`/shared/${token}/view`);
      }
    } catch {
      setError('Invalid or expired code. Please try again.');
    }
  };

  if (tokenLoading || step === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (step === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h1 className="text-xl font-semibold text-primary mb-2">
            Invalid or Expired Link
          </h1>
          <p className="text-secondary">
            This share link is no longer valid. Please contact the course owner
            for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (step === 'failed') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h1 className="text-xl font-semibold text-primary mb-2">
            Share Link Unavailable
          </h1>
          <p className="text-secondary">
            This share link failed to prepare. Please contact the course owner
            to create a new link.
          </p>
        </div>
      </div>
    );
  }

  if (step === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md text-center">
          <Clock className="mx-auto h-12 w-12 text-indigo-500 mb-4 animate-pulse" />
          <h1 className="text-xl font-semibold text-primary mb-2">
            Preparing Your Review
          </h1>
          <p className="text-secondary mb-4">
            The course content is being prepared for review. This usually takes
            just a few seconds.
          </p>
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-surface border shadow-lg p-6">
        <div className="text-center mb-6">
          <Shield className="mx-auto h-10 w-10 text-indigo-500 mb-3" />
          <h1 className="text-xl font-semibold text-primary">
            {tokenData?.courseTitle || 'Course Review'}
          </h1>
          <p className="text-sm text-secondary mt-1">
            {step === 'email'
              ? 'Enter your email to receive a verification code'
              : 'Enter the 6-digit code sent to your email'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {step === 'email' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                  placeholder="your@email.com"
                  className="w-full rounded-md border bg-page pl-10 pr-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
            </div>
            <Button
              variant="primary"
              onClick={handleSendCode}
              disabled={!email.trim() || sendCode.isLoading}
              className="w-full"
            >
              {sendCode.isLoading ? 'Sending...' : 'Send Verification Code'}
            </Button>
          </div>
        )}

        {step === 'code' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">
                Verification Code
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="text"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  onKeyDown={(e) =>
                    e.key === 'Enter' && code.length === 6 && handleVerifyCode()
                  }
                  placeholder="000000"
                  className="w-full rounded-md border bg-page pl-10 pr-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 tracking-widest text-center font-mono text-lg"
                  maxLength={6}
                  autoFocus
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                Code sent to {email}. Expires in 10 minutes.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={handleVerifyCode}
              disabled={code.length !== 6 || verifyCode.isLoading}
              className="w-full"
            >
              {verifyCode.isLoading ? 'Verifying...' : 'Verify Code'}
            </Button>
            <button
              onClick={() => {
                setStep('email');
                setCode('');
                setError('');
              }}
              className="w-full text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
