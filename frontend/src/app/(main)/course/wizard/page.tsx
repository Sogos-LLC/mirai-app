'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CourseWizard } from '@/components/wizard';

/**
 * Course Wizard Page - 6-step AI-guided course creation
 *
 * Steps:
 * 1. Select knowledge sources (team/global docs) - auto-skips if none exist
 * 2. Enter course name (+ optional course-specific file uploads)
 * 3. Review AI-improved title + description
 * 4. Select SME personas
 * 5. Select audience personas
 * 6. Select tone/style + additional context → Generate outline
 *
 * State is managed by XState machine and persisted to backend
 * until outline approval, then course is created.
 */
export default function CourseWizardPage() {
  const router = useRouter();

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-secondary hover:text-primary transition-colors mb-4 min-h-[44px] -ml-2 px-2"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-base">Back to Dashboard</span>
        </button>
        <h1 className="text-2xl md:text-3xl font-bold text-primary">Create New Course</h1>
        <p className="text-secondary mt-2">
          Let AI guide you through creating an engaging course in 6 simple steps
        </p>
      </div>

      {/* Wizard Component */}
      <CourseWizard />
    </div>
  );
}
