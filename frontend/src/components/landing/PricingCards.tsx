'use client';

import React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

const tiers = [
  {
    name: 'Starter',
    price: '$29',
    period: '/month',
    description: 'Perfect for small teams getting started with course creation.',
    features: [
      'Up to 5 team members',
      '10 published courses',
      'Basic analytics',
      'Email support',
      'Community access',
    ],
    cta: 'Start Free Trial',
    ctaLink: '/auth/registration?tier=starter',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$99',
    period: '/month',
    description: 'For growing teams that need more power and flexibility.',
    features: [
      'Up to 25 team members',
      'Unlimited courses',
      'Advanced analytics',
      'Priority support',
      'AI content generation',
      'Custom branding',
      'SSO integration',
    ],
    cta: 'Start Free Trial',
    ctaLink: '/auth/registration?tier=pro',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations with custom requirements.',
    features: [
      'Unlimited team members',
      'Unlimited courses',
      'Custom analytics',
      'Dedicated support',
      'Advanced AI features',
      'White-label solution',
      'Custom integrations',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    ctaLink: '/contact',
    highlighted: false,
  },
];

export default function PricingCards() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Choose the plan that fits your team. All plans include a 14-day free trial.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-2xl p-8 ${
                tier.highlighted
                  ? 'bg-indigo-600 text-white ring-4 ring-indigo-600 ring-offset-2'
                  : 'bg-white border border-slate-200'
              }`}
            >
              <h3
                className={`text-xl font-semibold mb-2 ${
                  tier.highlighted ? 'text-white' : 'text-slate-900'
                }`}
              >
                {tier.name}
              </h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span
                  className={`text-4xl font-bold ${
                    tier.highlighted ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {tier.price}
                </span>
                <span
                  className={tier.highlighted ? 'text-indigo-200' : 'text-slate-500'}
                >
                  {tier.period}
                </span>
              </div>
              <p
                className={`mb-6 ${
                  tier.highlighted ? 'text-indigo-100' : 'text-slate-600'
                }`}
              >
                {tier.description}
              </p>

              <ul className="space-y-3 mb-8">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check
                      className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                        tier.highlighted ? 'text-indigo-200' : 'text-indigo-600'
                      }`}
                    />
                    <span
                      className={
                        tier.highlighted ? 'text-indigo-50' : 'text-slate-600'
                      }
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={tier.ctaLink}
                className={`block w-full text-center py-3 px-4 rounded-lg font-semibold transition-colors ${
                  tier.highlighted
                    ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
