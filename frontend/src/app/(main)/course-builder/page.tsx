'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Construction, ArrowLeft } from 'lucide-react';

export default function CourseBuilder() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Construction className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Course Builder Coming Soon
          </h1>
          <p className="text-gray-600 mb-6">
            We're working on an amazing new course creation experience. Check back soon!
          </p>
          <button
            onClick={() => router.push('/content-library')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Content Library
          </button>
        </div>
      </div>
    </div>
  );
}
