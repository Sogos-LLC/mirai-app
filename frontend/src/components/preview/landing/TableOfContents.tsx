'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import type { OutlineSection } from '@/gen/mirai/v1/ai_generation_types_pb';

interface TableOfContentsProps {
  sections: OutlineSection[];
  onLessonClick: (globalIndex: number) => void;
}

export function TableOfContents({ sections, onLessonClick }: TableOfContentsProps) {
  // All sections expanded by default
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    () => new Set(sections.map((_, i) => i))
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

  // Calculate global lesson index
  let globalIndex = 0;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-12">
      <h2 className="text-2xl font-bold text-primary mb-6">Course Outline</h2>

      <div className="border rounded-xl overflow-hidden divide-y bg-surface">
        {sections.map((section, sectionIndex) => {
          const isExpanded = expandedSections.has(sectionIndex);
          const lessonCount = section.lessons?.length ?? 0;
          const startIndex = globalIndex;

          return (
            <div key={section.id || sectionIndex}>
              {/* Section header */}
              <button
                onClick={() => toggleSection(sectionIndex)}
                className="w-full flex items-center gap-3 p-4 hover:bg-hover transition-colors text-left"
              >
                <span className="text-muted">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">
                      Section {sectionIndex + 1}
                    </span>
                    <span className="text-xs text-muted">
                      ({lessonCount} lesson{lessonCount !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <h3 className="font-semibold text-primary truncate">
                    {section.title}
                  </h3>
                </div>
              </button>

              {/* Lessons */}
              {isExpanded && section.lessons && (
                <div className="bg-page">
                  {section.lessons.map((lesson, lessonIndex) => {
                    const currentGlobalIndex = startIndex + lessonIndex;
                    globalIndex = currentGlobalIndex + 1;

                    return (
                      <button
                        key={lesson.id || lessonIndex}
                        onClick={() => onLessonClick(currentGlobalIndex)}
                        className="w-full flex items-start gap-3 px-4 py-3 pl-12 hover:bg-hover transition-colors text-left group"
                      >
                        <BookOpen className="w-4 h-4 text-muted mt-0.5 flex-shrink-0 group-hover:text-primary-600" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-primary group-hover:text-primary-600">
                            {lesson.title}
                          </p>
                          {lesson.description && (
                            <p className="text-xs text-muted line-clamp-1 mt-0.5">
                              {lesson.description}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
