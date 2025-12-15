'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { buildAuthUrl } from '@/lib/urls';

export default function Hero() {
  return (
    <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-full text-sm font-medium mb-8 dark:border dark:border-indigo-800/40">
          <Sparkles className="h-4 w-4" />
          <span>AI-Powered Course Creation</span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl font-bold text-primary mb-6 leading-tight">
          Build Engaging Courses{' '}
          <span className="text-indigo-600 dark:text-indigo-400">10x Faster</span>{' '}
          test
        </h1>

        {/* Subheadline */}
        <p className="text-xl text-secondary mb-10 max-w-2xl mx-auto leading-relaxed">
          Mirai helps startup teams create professional learning content with
          AI assistance. From onboarding guides to product training, build
          courses that your team will actually complete.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={buildAuthUrl('/auth/registration')}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:shadow-lg hover:shadow-indigo-500/25 flex items-center justify-center gap-2"
          >
            Get Started
            <ArrowRight className="h-5 w-5" />
          </a>
          <Link
            href="/pricing"
            className="w-full sm:w-auto bg-surface hover:bg-hover text-primary px-8 py-4 rounded-xl font-semibold text-lg border transition-colors"
          >
            View Pricing
          </Link>
        </div>

        {/* Social Proof */}
        <p className="mt-8 text-muted text-sm">
          Trusted by teams at growing startups
        </p>
      </div>
    </section>
  );
}
