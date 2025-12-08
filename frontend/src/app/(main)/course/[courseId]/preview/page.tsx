'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  BookOpen,
  CheckCircle,
  Circle,
  Loader2,
  Menu,
  Edit3,
} from 'lucide-react';
import { useGetCourseOutline, useListGeneratedLessons } from '@/hooks/useAIGeneration';
import { ComponentRenderer } from '@/components/course/renderers/ComponentRenderer';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useIsMobile } from '@/hooks/useBreakpoint';
import type { GeneratedLesson, OutlineSection } from '@/gen/mirai/v1/ai_generation_pb';

interface LessonNavItem {
  outlineLessonId: string;
  title: string;
  sectionIndex: number;
  lessonIndex: number;
  generatedLesson?: GeneratedLesson;
}

export default function CoursePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;
  const isMobile = useIsMobile();

  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [showMobileNav, setShowMobileNav] = useState(false);

  // Fetch outline and generated lessons
  const { data: outline, isLoading: outlineLoading } = useGetCourseOutline(courseId);
  const { data: generatedLessons, isLoading: lessonsLoading } = useListGeneratedLessons(courseId);

  // Build flat list of lessons with navigation info
  const lessonNavItems = useMemo((): LessonNavItem[] => {
    if (!outline?.sections) return [];

    const items: LessonNavItem[] = [];
    outline.sections.forEach((section, sectionIndex) => {
      section.lessons?.forEach((lesson, lessonIndex) => {
        const generatedLesson = generatedLessons?.find(
          (gl) => gl.outlineLessonId === lesson.id
        );
        items.push({
          outlineLessonId: lesson.id,
          title: lesson.title,
          sectionIndex,
          lessonIndex,
          generatedLesson,
        });
      });
    });
    return items;
  }, [outline, generatedLessons]);

  const currentLesson = lessonNavItems[currentLessonIndex];
  const totalLessons = lessonNavItems.length;
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons.size / totalLessons) * 100) : 0;

  const toggleSection = (sectionIndex: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionIndex)) {
        next.delete(sectionIndex);
      } else {
        next.add(sectionIndex);
      }
      return next;
    });
  };

  const goToLesson = (index: number) => {
    if (index >= 0 && index < totalLessons) {
      // Mark current lesson as completed when moving forward
      if (index > currentLessonIndex && currentLesson) {
        setCompletedLessons((prev) => new Set(prev).add(currentLesson.outlineLessonId));
      }
      setCurrentLessonIndex(index);
      // Auto-expand the section containing the new lesson
      const newLesson = lessonNavItems[index];
      if (newLesson) {
        setExpandedSections((prev) => new Set(prev).add(newLesson.sectionIndex));
      }
      // Close mobile nav after selection
      if (isMobile) {
        setShowMobileNav(false);
      }
    }
  };

  const handleClose = () => {
    router.push('/content-library');
  };

  // Loading state
  if (outlineLoading || lessonsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-page">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary">Loading course...</p>
        </div>
      </div>
    );
  }

  // No outline found
  if (!outline) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-page">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-muted mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-primary mb-2">Course Not Found</h2>
          <p className="text-secondary mb-4">This course outline could not be loaded.</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  // No lessons generated yet
  if (lessonNavItems.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-page">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-muted mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-primary mb-2">No Lessons Yet</h2>
          <p className="text-secondary mb-4">This course hasn't generated any lesson content yet.</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  // Create lesson navigation component (used in both sidebar and BottomSheet)
  const LessonNavigation = () => (
    <>
      {/* Progress bar */}
      <div className="p-4 border-b border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-primary">Progress</span>
          <span className="text-sm text-secondary">
            {completedLessons.size} / {totalLessons} lessons
          </span>
        </div>
        <div className="h-2 bg-page rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-600 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Sections & Lessons */}
      <nav className="flex-1 overflow-y-auto p-2">
        {outline.sections?.map((section, sectionIndex) => {
          const isExpanded = expandedSections.has(sectionIndex);
          const sectionLessons = lessonNavItems.filter(
            (l) => l.sectionIndex === sectionIndex
          );

          return (
            <div key={section.id} className="mb-2">
              {/* Section header */}
              <button
                onClick={() => toggleSection(sectionIndex)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-hover rounded-lg min-h-[44px]"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-muted" />
                )}
                <span className="text-sm font-medium text-primary truncate">
                  {section.title}
                </span>
              </button>

              {/* Lessons */}
              {isExpanded && (
                <div className="ml-4 mt-1 space-y-1">
                  {sectionLessons.map((lessonItem) => {
                    const globalIndex = lessonNavItems.findIndex(
                      (l) => l.outlineLessonId === lessonItem.outlineLessonId
                    );
                    const isActive = globalIndex === currentLessonIndex;
                    const isCompleted = completedLessons.has(lessonItem.outlineLessonId);
                    const hasContent = !!lessonItem.generatedLesson;

                    return (
                      <button
                        key={lessonItem.outlineLessonId}
                        onClick={() => goToLesson(globalIndex)}
                        disabled={!hasContent}
                        className={`
                          w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg text-sm min-h-[44px]
                          ${isActive ? 'bg-primary-50 text-primary-700' : 'hover:bg-hover text-secondary'}
                          ${!hasContent ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        {isCompleted ? (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : isActive ? (
                          <Circle className="w-4 h-4 text-primary-600 fill-primary-600 flex-shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-muted flex-shrink-0" />
                        )}
                        <span className="truncate">{lessonItem.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );

  return (
    <div className="flex flex-col h-screen bg-page">
      {/* Header */}
      <header className="bg-surface border-b border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isMobile && (
            <button
              onClick={() => setShowMobileNav(true)}
              className="p-2 -ml-2 text-secondary hover:text-primary hover:bg-hover rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Open lesson navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <BookOpen className="w-6 h-6 text-primary-600" />
          <h1 className="text-lg font-semibold text-primary truncate max-w-[200px] sm:max-w-md">
            Course Preview
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-xs sm:text-sm text-secondary hidden sm:inline">
            {progressPercent}% complete
          </span>
          <button
            onClick={() => router.push(`/course/${courseId}/editor`)}
            className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-secondary hover:text-primary hover:bg-hover rounded-lg transition-colors"
            aria-label="Back to Editor"
          >
            <Edit3 className="w-4 h-4" />
            <span className="hidden sm:inline text-sm">Edit</span>
          </button>
          <button
            onClick={handleClose}
            className="p-2 text-secondary hover:text-primary hover:bg-hover rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile Navigation BottomSheet */}
      {isMobile && (
        <BottomSheet
          isOpen={showMobileNav}
          onClose={() => setShowMobileNav(false)}
          title="Lessons"
          height="full"
        >
          <LessonNavigation />
        </BottomSheet>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar Navigation */}
        {!isMobile && (
          <aside className="w-72 bg-surface border-r border flex flex-col">
            <LessonNavigation />
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Lesson Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              {currentLesson?.generatedLesson ? (
                <>
                  {/* Lesson Title */}
                  <h2 className="text-xl sm:text-2xl font-bold text-primary mb-6">
                    {currentLesson.generatedLesson.title || currentLesson.title}
                  </h2>

                  {/* Lesson Components */}
                  <div className="space-y-6">
                    {currentLesson.generatedLesson.components
                      ?.sort((a, b) => a.order - b.order)
                      .filter((component, index) => {
                        // Always skip first component if it's a heading
                        // We already display the lesson title, so first heading is redundant
                        if (index === 0 && component.type === 2) { // 2 = HEADING
                          return false;
                        }
                        return true;
                      })
                      .map((component) => (
                        <ComponentRenderer
                          key={component.id}
                          component={component}
                        />
                      ))}
                  </div>

                  {/* Segue Text (transition to next lesson) */}
                  {currentLesson.generatedLesson.segueText && currentLessonIndex < totalLessons - 1 && (
                    <div className="mt-8 p-4 bg-primary-50 border border-primary-200 rounded-lg">
                      <p className="text-primary-800 italic">
                        {currentLesson.generatedLesson.segueText}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted mx-auto mb-4" />
                  <p className="text-secondary">Lesson content is being generated...</p>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Footer */}
          <footer className="bg-surface border-t border px-4 sm:px-6 py-4 safe-area-bottom">
            <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0">
              <button
                onClick={() => goToLesson(currentLessonIndex - 1)}
                disabled={currentLessonIndex === 0}
                className={`
                  flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium min-h-[44px]
                  ${currentLessonIndex === 0
                    ? 'text-muted cursor-not-allowed'
                    : 'text-primary hover:bg-hover'
                  }
                `}
              >
                <ChevronLeft className="w-5 h-5" />
                Previous
              </button>

              <span className="text-xs sm:text-sm text-secondary text-center">
                Lesson {currentLessonIndex + 1} of {totalLessons}
              </span>

              <button
                onClick={() => goToLesson(currentLessonIndex + 1)}
                disabled={currentLessonIndex === totalLessons - 1}
                className={`
                  flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium min-h-[44px]
                  ${currentLessonIndex === totalLessons - 1
                    ? 'text-muted cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                  }
                `}
              >
                {currentLessonIndex === totalLessons - 1 ? 'Complete' : 'Next'}
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
