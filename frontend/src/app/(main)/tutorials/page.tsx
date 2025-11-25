'use client';

import React, { useState } from 'react';
import { BookOpen, Play, Clock, CheckCircle } from 'lucide-react';

export default function TutorialsPage() {
  const tutorials = [
    {
      id: 1,
      title: 'Getting Started with Mirai',
      description: 'Learn the basics of content creation and navigation',
      duration: '10 min',
      completed: true,
      category: 'Beginner',
    },
    {
      id: 2,
      title: 'Creating Your First Campaign',
      description: 'Step-by-step guide to launching your first marketing campaign',
      duration: '15 min',
      completed: true,
      category: 'Beginner',
    },
    {
      id: 3,
      title: 'Advanced Template Customization',
      description: 'Master template editing and personalization techniques',
      duration: '20 min',
      completed: false,
      category: 'Intermediate',
    },
    {
      id: 4,
      title: 'Brand Voice Optimization',
      description: 'Fine-tune AI outputs to match your brand perfectly',
      duration: '25 min',
      completed: false,
      category: 'Advanced',
    },
    {
      id: 5,
      title: 'Multi-Channel Distribution',
      description: 'Learn to distribute content across multiple platforms efficiently',
      duration: '18 min',
      completed: false,
      category: 'Intermediate',
    },
    {
      id: 6,
      title: 'Analytics and Performance Tracking',
      description: 'Understand metrics and optimize your content strategy',
      duration: '22 min',
      completed: false,
      category: 'Advanced',
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Tutorials</h1>
          <p className="text-gray-600">Learn how to make the most of Mirai</p>
        </div>
      </div>

      {/* Banner / Continue section */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-8 mb-8 text-white">
        <h2 className="text-2xl font-bold mb-2">Continue Learning</h2>
        <p className="mb-4 opacity-90">Pick up where you left off</p>

        <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/30 rounded-lg flex items-center justify-center">
                <Play className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold">Advanced Template Customization</h3>
                <p className="text-sm opacity-90">45% complete</p>
              </div>
            </div>
            <button className="bg-white text-primary-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100">
              Resume
            </button>
          </div>
          <div className="mt-4 bg-white/20 rounded-full h-2">
            <div className="bg-white rounded-full h-2 w-[45%]" />
          </div>
        </div>
      </div>

      {/* Tutorials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tutorials.map((tutorial) => (
          <div
            key={tutorial.id}
            className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-primary-600" />
              </div>
              {tutorial.completed && (
                <CheckCircle className="w-6 h-6 text-green-500" />
              )}
            </div>
            <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full mb-3">
              {tutorial.category}
            </span>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {tutorial.title}
            </h3>
            <p className="text-gray-600 text-sm mb-4">{tutorial.description}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-gray-500 text-sm">
                <Clock className="w-4 h-4" />
                <span>{tutorial.duration}</span>
              </div>
              <button className="text-primary-600 font-semibold text-sm hover:text-primary-700">
                {tutorial.completed ? 'Review' : 'Start'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

