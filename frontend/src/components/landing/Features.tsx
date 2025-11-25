'use client';

import React from 'react';
import {
  Zap,
  Users,
  BarChart3,
  Layers,
  Lock,
  Palette
} from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: 'AI-Powered Generation',
    description:
      'Generate course outlines, quizzes, and content suggestions with advanced AI assistance.',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description:
      'Work together with your team to create and review courses before publishing.',
  },
  {
    icon: BarChart3,
    title: 'Progress Analytics',
    description:
      'Track learner engagement and completion rates with detailed analytics.',
  },
  {
    icon: Layers,
    title: 'Multi-Format Content',
    description:
      'Support for videos, documents, quizzes, and interactive elements.',
  },
  {
    icon: Lock,
    title: 'Enterprise Security',
    description:
      'SOC 2 compliant with SSO support and granular access controls.',
  },
  {
    icon: Palette,
    title: 'Brand Customization',
    description:
      'Customize the look and feel to match your company branding.',
  },
];

export default function Features() {
  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Everything you need to build great courses
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Powerful features designed for growing teams that want to scale
            their learning programs.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="p-6 rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-lg transition-all"
            >
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                <feature.icon className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {feature.title}
              </h3>
              <p className="text-slate-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
