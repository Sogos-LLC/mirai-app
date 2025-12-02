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
} from 'lucide-react';
import { useGetCourseOutline, useListGeneratedLessons } from '@/hooks/useAIGeneration';
import { ComponentRenderer } from '@/components/course/renderers/ComponentRenderer';
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

  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());

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
    }
  };

  const handleClose = () => {
    router.push('/content-library');
  };

  // Loading state
  if (outlineLoading || lessonsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading course...</p>
        </div>
      </div>
    );
  }

  // No outline found
  if (!outline) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Course Not Found</h2>
          <p className="text-gray-600 mb-4">This course outline could not be loaded.</p>
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
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Lessons Yet</h2>
          <p className="text-gray-600 mb-4">This course hasn't generated any lesson content yet.</p>
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

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-primary-600" />
          <h1 className="text-lg font-semibold text-gray-900 truncate max-w-md">
            Course Preview
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {progressPercent}% complete
          </span>
          <button
            onClick={handleClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-72 bg-white border-r border-gray-200 flex flex-col">
          {/* Progress bar */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Progress</span>
              <span className="text-sm text-gray-500">
                {completedLessons.size} / {totalLessons} lessons
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
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
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 rounded-lg"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="text-sm font-medium text-gray-900 truncate">
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
                              w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg text-sm
                              ${isActive ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50 text-gray-700'}
                              ${!hasContent ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                          >
                            {isCompleted ? (
                              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                            ) : isActive ? (
                              <Circle className="w-4 h-4 text-primary-600 fill-primary-600 flex-shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
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
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Lesson Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-8">
              {currentLesson?.generatedLesson ? (
                <>
                  {/* Lesson Title */}
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">
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
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Lesson content is being generated...</p>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Footer */}
          <footer className="bg-white border-t border-gray-200 px-6 py-4">
            <div className="max-w-3xl mx-auto flex items-center justify-between">
              <button
                onClick={() => goToLesson(currentLessonIndex - 1)}
                disabled={currentLessonIndex === 0}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-medium
                  ${currentLessonIndex === 0
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <ChevronLeft className="w-5 h-5" />
                Previous
              </button>

              <span className="text-sm text-gray-500">
                Lesson {currentLessonIndex + 1} of {totalLessons}
              </span>

              <button
                onClick={() => goToLesson(currentLessonIndex + 1)}
                disabled={currentLessonIndex === totalLessons - 1}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-medium
                  ${currentLessonIndex === totalLessons - 1
                    ? 'text-gray-400 cursor-not-allowed'
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
