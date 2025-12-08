'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { buildRegistrationUrl } from '@/lib/urls';

const tiers = [
  {
    name: 'Starter',
    price: '$8',
    period: '/seat/month',
    description: 'For small teams getting started with course creation.',
    features: [
      'Up to 10 team members',
      'Basic course builder',
      'Email support',
      '5GB storage',
    ],
    cta: 'Get Started',
    ctaLink: buildRegistrationUrl('starter'),
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$12',
    period: '/seat/month',
    description: 'For growing organizations that need more power.',
    features: [
      'Unlimited team members',
      'Advanced course builder',
      'Priority support',
      '50GB storage',
      'Custom branding',
      'Analytics dashboard',
    ],
    cta: 'Get Started',
    ctaLink: buildRegistrationUrl('pro'),
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations with custom requirements.',
    features: [
      'Everything in Pro',
      'Dedicated support',
      'Unlimited storage',
      'SSO/SAML',
      'Custom integrations',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    ctaLink: buildRegistrationUrl('enterprise'),
    highlighted: false,
  },
];

export default function PricingCards() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-secondary max-w-2xl mx-auto">
            Choose the plan that fits your team. Pay per seat, cancel anytime.
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
                  : 'bg-surface border'
              }`}
            >
              <h3
                className={`text-xl font-semibold mb-2 ${
                  tier.highlighted ? 'text-white' : 'text-primary'
                }`}
              >
                {tier.name}
              </h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span
                  className={`text-4xl font-bold ${
                    tier.highlighted ? 'text-white' : 'text-primary'
                  }`}
                >
                  {tier.price}
                </span>
                <span
                  className={tier.highlighted ? 'text-indigo-200' : 'text-muted'}
                >
                  {tier.period}
                </span>
              </div>
              <p
                className={`mb-6 ${
                  tier.highlighted ? 'text-indigo-100' : 'text-secondary'
                }`}
              >
                {tier.description}
              </p>

              <ul className="space-y-3 mb-8">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check
                      className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                        tier.highlighted ? 'text-indigo-200' : 'text-indigo-600 dark:text-indigo-400'
                      }`}
                    />
                    <span
                      className={
                        tier.highlighted ? 'text-indigo-50' : 'text-secondary'
                      }
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href={tier.ctaLink}
                className={`block w-full text-center py-3 px-4 rounded-lg font-semibold transition-colors ${
                  tier.highlighted
                    ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
