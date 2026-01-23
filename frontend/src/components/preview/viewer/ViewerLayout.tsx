'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { ViewerHeader } from './ViewerHeader';
import { ViewerSidebar } from './ViewerSidebar';
import { ViewerContent } from './ViewerContent';
import { ViewerFooter } from './ViewerFooter';
import type { PreviewData, FlattenedLesson } from '@/hooks/usePreviewData';

interface ViewerLayoutProps {
  preview: PreviewData;
  currentLesson: FlattenedLesson;
  currentIndex: number;
  completedLessons: Set<string>;
  progressPercent: number;
  onNavigate: (index: number) => void;
}

export function ViewerLayout({
  preview,
  currentLesson,
  currentIndex,
  completedLessons,
  progressPercent,
  onNavigate,
}: ViewerLayoutProps) {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < preview.totalLessons - 1;

  const handlePrevious = () => {
    if (hasPrevious) onNavigate(currentIndex - 1);
  };

  const handleNext = () => {
    if (hasNext) onNavigate(currentIndex + 1);
  };

  return (
    <div className="flex flex-col h-screen bg-page">
      <ViewerHeader
        courseId={preview.courseId}
        courseTitle={preview.courseTitle}
        sectionTitle={currentLesson.sectionTitle}
        lessonTitle={currentLesson.title}
        progressPercent={progressPercent}
        onMenuClick={() => setShowMobileSidebar(true)}
        showMenu
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <ViewerSidebar
            sections={preview.sections}
            currentLessonIndex={currentIndex}
            completedLessons={completedLessons}
            progressPercent={progressPercent}
            onLessonClick={onNavigate}
          />
        </div>

        {/* Main content */}
        <ViewerContent lesson={currentLesson} />
      </div>

      <ViewerFooter
        currentIndex={currentIndex}
        totalLessons={preview.totalLessons}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
      />

      {/* Mobile sidebar overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMobileSidebar(false)}
          />

          {/* Sidebar */}
          <div className="absolute left-0 top-0 h-full w-80 max-w-[85vw] animate-slide-in-left">
            <div className="h-full bg-surface flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <span className="font-semibold text-primary">Course Navigation</span>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-2 rounded-lg hover:bg-hover transition-colors"
                >
                  <X className="w-5 h-5 text-secondary" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ViewerSidebar
                  sections={preview.sections}
                  currentLessonIndex={currentIndex}
                  completedLessons={completedLessons}
                  progressPercent={progressPercent}
                  onLessonClick={(index) => {
                    onNavigate(index);
                    setShowMobileSidebar(false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
