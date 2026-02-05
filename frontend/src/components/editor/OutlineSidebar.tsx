'use client';

import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { OutlineSection, GeneratedLesson } from '@/gen/mirai/v1/ai_generation_types_pb';

export interface LessonListItem {
  id: string;
  title: string;
  sectionIndex: number;
  generated?: GeneratedLesson;
}

interface OutlineSidebarProps {
  outline: { sections?: OutlineSection[] };
  lessonsList: LessonListItem[];
  expandedSections: Set<number>;
  selectedLessonId: string | null;
  onLessonSelect: (id: string) => void;
  onToggleSection: (idx: number) => void;
}

export function OutlineSidebar({
  outline,
  lessonsList,
  expandedSections,
  selectedLessonId,
  onLessonSelect,
  onToggleSection,
}: OutlineSidebarProps) {
  return (
    <aside className="w-64 flex-shrink-0 hidden lg:block">
      <Card>
        <CardHeader className="py-3">
          <CardTitle as="h3">Course Outline</CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-0">
          <nav className="max-h-[calc(100vh-20rem)] overflow-y-auto">
            {outline.sections?.map((section: OutlineSection, sectionIndex: number) => {
              const isExpanded = expandedSections.has(sectionIndex);
              const sectionLessons = lessonsList.filter((l) => l.sectionIndex === sectionIndex);

              return (
                <div key={section.id} className="mb-1">
                  <button
                    onClick={() => onToggleSection(sectionIndex)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-surface transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted" />
                    )}
                    <span className="text-sm font-medium text-primary truncate">
                      {section.title}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="ml-4">
                      {sectionLessons.map((lesson) => {
                        const isActive = lesson.id === selectedLessonId;
                        const hasContent = !!lesson.generated;
                        const gScore = lesson.generated?.groundingScore ?? 0;

                        return (
                          <button
                            key={lesson.id}
                            onClick={() => onLessonSelect(lesson.id)}
                            disabled={!hasContent}
                            className={`
                              w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors
                              ${isActive ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600' : 'hover:bg-surface text-secondary'}
                              ${!hasContent ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                          >
                            <FileText className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate flex-1">{lesson.title}</span>
                            {hasContent && gScore > 0 && (
                              <span
                                className={`flex-shrink-0 w-2 h-2 rounded-full ${
                                  gScore >= 0.6 ? 'bg-green-500' : gScore >= 0.3 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                title={`${Math.round(gScore * 100)}% grounded`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </CardContent>
      </Card>
    </aside>
  );
}
