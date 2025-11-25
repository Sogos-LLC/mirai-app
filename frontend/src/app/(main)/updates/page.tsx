'use client';

import React from 'react';
import { Sparkles, Zap, CheckCircle, Clock } from 'lucide-react';

export default function UpdatesPage() {
  const updates = [
    {
      id: 1,
      title: 'New Template Library',
      description:
        'We have added 50+ new templates across various categories including marketing, sales, and customer support.',
      date: 'October 15, 2025',
      type: 'Feature',
      icon: Sparkles,
    },
    {
      id: 2,
      title: 'Enhanced AI Content Generation',
      description:
        'Our AI model has been upgraded to provide even more accurate and contextual content suggestions.',
      date: 'October 10, 2025',
      type: 'Improvement',
      icon: Zap,
    },
    {
      id: 3,
      title: 'Multi-Language Support',
      description:
        'Mirai now supports content creation in 15 languages with native AI understanding.',
      date: 'October 5, 2025',
      type: 'Feature',
      icon: Sparkles,
    },
    {
      id: 4,
      title: 'Performance Improvements',
      description:
        'We have optimized the platform for faster loading times and smoother interactions.',
      date: 'September 28, 2025',
      type: 'Improvement',
      icon: Zap,
    },
    {
      id: 5,
      title: 'Collaboration Features',
      description:
        'New real-time collaboration tools allow teams to work together seamlessly on content projects.',
      date: 'September 20, 2025',
      type: 'Feature',
      icon: Sparkles,
    },
    {
      id: 6,
      title: 'Mobile App Launch',
      description:
        'Our iOS and Android apps are now available for download on the App Store and Google Play.',
      date: 'September 12, 2025',
      type: 'Feature',
      icon: Sparkles,
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Product Updates</h1>
          <p className="text-gray-600">Stay up to date with the latest features and improvements</p>
        </div>
      </div>

      {/* Featured / Latest Update Banner */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-8 mb-8 text-white">
        <h2 className="text-2xl font-bold mb-2">Latest Update</h2>
        <p className="mb-4 opacity-90">Discover what’s new in Mirai</p>

        <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/30 rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold">New Template Library</h3>
                <p className="text-sm opacity-90">Released on October 15, 2025</p>
              </div>
            </div>
            <button className="bg-white text-primary-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100">
              Read More
            </button>
          </div>
          <div className="mt-4 bg-white/20 rounded-full h-2">
            <div className="bg-white rounded-full h-2 w-full" />
          </div>
        </div>
      </div>

      {/* Updates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {updates.map((update) => {
          const Icon = update.icon;
          return (
            <div
              key={update.id}
              className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary-600" />
                </div>
                <span className="text-xs font-medium text-gray-500">
                  {update.date}
                </span>
              </div>
              <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full mb-3">
                {update.type}
              </span>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {update.title}
              </h3>
              <p className="text-gray-600 text-sm mb-4">{update.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-gray-500 text-sm">
                  <Clock className="w-4 h-4" />
                  <span>{update.date}</span>
                </div>
                <button className="text-primary-600 font-semibold text-sm hover:text-primary-700">
                  View Details
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

