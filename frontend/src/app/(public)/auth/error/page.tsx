'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/auth/AuthLayout';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { KratosError } from '@/lib/kratos/types';
import { getKratosBrowserUrl } from '@/lib/kratos';

export default function ErrorPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<KratosError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const errorId = searchParams.get('id');

    async function fetchError() {
      if (!errorId) {
        setLoading(false);
        return;
      }

      try {
        const kratosUrl = getKratosBrowserUrl();
        const response = await fetch(
          `${kratosUrl}/self-service/errors?id=${errorId}`,
          { credentials: 'include' }
        );

        if (response.ok) {
          const data = await response.json();
          setError(data);
        }
      } catch (err) {
        console.error('Failed to fetch error details:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchError();
  }, [searchParams]);

  if (loading) {
    return (
      <AuthLayout title="Error" subtitle="Something went wrong">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Error" subtitle="Something went wrong">
      <div className="text-center py-4">
        <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />

        {error ? (
          <>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              {error.error.status}
            </h2>
            <p className="text-slate-600 mb-2">{error.error.message}</p>
            {error.error.reason && (
              <p className="text-sm text-slate-500 mb-6">{error.error.reason}</p>
            )}
          </>
        ) : (
          <p className="text-slate-600 mb-6">
            An unexpected error occurred. Please try again.
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/auth/login"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Back to Login
          </Link>
          <Link
            href="/"
            className="text-slate-600 hover:text-slate-900 font-medium"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
