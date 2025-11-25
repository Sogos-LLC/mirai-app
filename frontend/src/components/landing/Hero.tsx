'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function Hero() {
  return (
    <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full text-sm font-medium mb-8">
          <Sparkles className="h-4 w-4" />
          <span>AI-Powered Course Creation</span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 mb-6 leading-tight">
          Build Engaging Courses{' '}
          <span className="text-indigo-600">10x Faster</span>
        </h1>

        {/* Subheadline */}
        <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
          Mirai helps startup teams create professional learning content with
          AI assistance. From onboarding guides to product training, build
          courses that your team will actually complete.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/auth/registration"
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:shadow-lg hover:shadow-indigo-500/25 flex items-center justify-center gap-2"
          >
            Start Free Trial
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="/pricing"
            className="w-full sm:w-auto bg-white hover:bg-slate-50 text-slate-900 px-8 py-4 rounded-xl font-semibold text-lg border border-slate-200 transition-colors"
          >
            View Pricing
          </Link>
        </div>

        {/* Social Proof */}
        <p className="mt-8 text-slate-500 text-sm">
          Trusted by teams at growing startups
        </p>
      </div>
    </section>
  );
}
