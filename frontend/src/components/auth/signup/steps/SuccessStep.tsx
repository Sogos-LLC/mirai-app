'use client';

import { CheckCircle, Mail } from 'lucide-react';
import Link from 'next/link';

interface SuccessStepProps {
  isEnterprise: boolean;
  companyName: string;
}

export function SuccessStep({ isEnterprise, companyName }: SuccessStepProps) {
  if (isEnterprise) {
    return (
      <div className="w-full max-w-md mx-auto text-center py-8">
        <div className="inline-flex items-center justify-center h-16 w-16 bg-green-100 rounded-full mb-6">
          <Mail className="h-8 w-8 text-green-600" />
        </div>

        <h2 className="text-2xl font-semibold text-slate-900 mb-3">
          Thank you for your interest!
        </h2>

        <p className="text-slate-600 mb-8">
          Our enterprise team will reach out to <span className="font-medium">{companyName}</span> within
          24 hours to discuss your needs and create a custom plan.
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Return to home
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto text-center py-8">
      <div className="inline-flex items-center justify-center h-16 w-16 bg-green-100 rounded-full mb-6">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>

      <h2 className="text-2xl font-semibold text-slate-900 mb-3">
        Welcome to Mirai!
      </h2>

      <p className="text-slate-600 mb-8">
        Your account has been created successfully. You&apos;ll be redirected to your dashboard shortly.
      </p>

      <Link
        href="/dashboard"
        className="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
