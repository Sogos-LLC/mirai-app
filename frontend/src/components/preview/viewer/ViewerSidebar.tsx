'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, Circle } from 'lucide-react';
import { ProgressBar } from '../shared/ProgressBar';
import type { OutlineSection } from '@/gen/mirai/v1/ai_generation_types_pb';

interface ViewerSidebarProps {
  sections: OutlineSection[];
  currentLessonIndex: number;
  completedLessons: Set<string>;
  progressPercent: number;
  onLessonClick: (globalIndex: number) => void;
}

export function ViewerSidebar({
  sections,
  currentLessonIndex,
  completedLessons,
  progressPercent,
  onLessonClick,
}: ViewerSidebarProps) {
  // Find which section contains the current lesson
  let currentSectionIndex = 0;
  let lessonCounter = 0;
  for (let i = 0; i < sections.length; i++) {
    const lessonCount = sections[i].lessons?.length ?? 0;
    if (currentLessonIndex < lessonCounter + lessonCount) {
      currentSectionIndex = i;
      break;
    }
    lessonCounter += lessonCount;
  }

  // Expand current section by default
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    () => new Set([currentSectionIndex])
  );

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  let globalIndex = 0;

  return (
    <aside className="w-72 bg-surface border-r flex flex-col h-full overflow-hidden">
      {/* Progress header */}
      <div className="p-4 border-b">
        <p className="text-sm font-medium text-primary mb-2">Course Progress</p>
        <ProgressBar percent={progressPercent} showLabel size="md" />
      </div>

      {/* Sections list */}
      <nav className="flex-1 overflow-y-auto">
        {sections.map((section, sectionIndex) => {
          const isExpanded = expandedSections.has(sectionIndex);
          const startIndex = globalIndex;

          return (
            <div key={section.id || sectionIndex} className="border-b last:border-b-0">
              {/* Section header */}
              <button
                onClick={() => toggleSection(sectionIndex)}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-hover transition-colors text-left"
              >
                <span className="text-muted">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
                <span className="text-sm font-medium text-primary truncate flex-1">
                  {section.title}
                </span>
              </button>

              {/* Lessons */}
              {isExpanded && section.lessons && (
                <div className="pb-2">
                  {section.lessons.map((lesson, lessonIndex) => {
                    const idx = startIndex + lessonIndex;
                    const isCurrent = idx === currentLessonIndex;
                    const isCompleted = completedLessons.has(lesson.id);
                    globalIndex = idx + 1;

                    return (
                      <button
                        key={lesson.id || lessonIndex}
                        onClick={() => onLessonClick(idx)}
                        className={`w-full flex items-center gap-2 px-4 py-2 pl-10 text-left transition-colors ${
                          isCurrent
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                            : 'hover:bg-hover text-secondary hover:text-primary'
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        ) : isCurrent ? (
                          <Circle className="w-4 h-4 text-primary-600 fill-primary-600 flex-shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-muted flex-shrink-0" />
                        )}
                        <span className="text-sm truncate">{lesson.title}</span>
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
  );
}
