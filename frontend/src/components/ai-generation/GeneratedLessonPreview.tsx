'use client';

import { useState } from 'react';
import type { GeneratedLesson, LessonComponent } from '@/gen/mirai/v1/ai_generation_types_pb';
import { ComponentRenderer } from '@/components/course/renderers';

interface GeneratedLessonPreviewProps {
  lesson: GeneratedLesson;
  onSelectComponent?: (componentId: string) => void;
  selectedComponentId?: string | null;
}

export function GeneratedLessonPreview({
  lesson,
  onSelectComponent,
  selectedComponentId,
}: GeneratedLessonPreviewProps) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Lesson Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b">
        <h2 className="text-xl font-semibold text-gray-900">{lesson.title}</h2>
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            {lesson.components.length} components
          </span>
        </div>
      </div>

      {/* Lesson Content */}
      <div className="p-6 space-y-6">
        {lesson.components
          .sort((a, b) => a.order - b.order)
          .map((component) => (
            <div
              key={component.id}
              className={`
                relative transition-all
                ${onSelectComponent ? 'cursor-pointer hover:ring-2 hover:ring-indigo-200 rounded-lg' : ''}
                ${selectedComponentId === component.id ? 'ring-2 ring-indigo-500 rounded-lg' : ''}
              `}
              onClick={() => onSelectComponent?.(component.id)}
            >
              <ComponentRenderer component={component} />
            </div>
          ))}
      </div>

      {/* Segue (transition to next lesson) */}
      {lesson.segueText && (
        <div className="px-6 py-4 bg-gray-50 border-t">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Next Up</p>
              <p className="text-sm text-gray-500 mt-0.5">{lesson.segueText}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// List view for multiple lessons
interface GeneratedLessonsListProps {
  lessons: GeneratedLesson[];
  onSelectLesson?: (lessonId: string) => void;
  selectedLessonId?: string | null;
}

export function GeneratedLessonsList({
  lessons,
  onSelectLesson,
  selectedLessonId,
}: GeneratedLessonsListProps) {
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

  // Group lessons by section
  const lessonsBySection = lessons.reduce(
    (acc, lesson) => {
      const sectionId = lesson.sectionId;
      if (!acc[sectionId]) {
        acc[sectionId] = [];
      }
      acc[sectionId].push(lesson);
      return acc;
    },
    {} as Record<string, GeneratedLesson[]>
  );

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Generated Lessons</h2>
            <p className="text-green-100 text-sm mt-1">{lessons.length} lessons generated</p>
          </div>
          <div className="bg-white/20 rounded-lg px-3 py-1.5">
            <span className="text-white text-sm font-medium">Ready for Review</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-6 py-3 bg-gray-50 border-b flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span className="text-gray-600">{Object.keys(lessonsBySection).length} sections</span>
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-gray-600">
            {lessons.reduce((sum, l) => sum + l.components.length, 0)} total components
          </span>
        </div>
      </div>

      {/* Lessons List */}
      <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
        {lessons.map((lesson, index) => {
          const isExpanded = expandedLessonId === lesson.id;
          const isSelected = selectedLessonId === lesson.id;

          return (
            <div key={lesson.id} className={isSelected ? 'bg-indigo-50' : ''}>
              {/* Lesson Header */}
              <div
                className={`
                  flex items-center justify-between p-4 cursor-pointer
                  ${isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'}
                `}
                onClick={() => setExpandedLessonId(isExpanded ? null : lesson.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-medium">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-medium text-gray-900">{lesson.title}</h3>
                    <p className="text-sm text-gray-500">
                      {lesson.components.length} components
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {onSelectLesson && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLesson(lesson.id);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100"
                    >
                      Edit
                    </button>
                  )}
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded Preview */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  <div className="ml-11 border rounded-lg overflow-hidden bg-white">
                    <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
                      {lesson.components
                        .sort((a, b) => a.order - b.order)
                        .map((component) => (
                          <div key={component.id} className="border-b last:border-0 pb-4 last:pb-0">
                            <ComponentRenderer component={component} />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-gray-50 border-t">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Review each lesson and make any necessary edits before finalizing the course.
          </p>
          <button className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700">
            Finalize Course
          </button>
        </div>
      </div>
    </div>
  );
}
