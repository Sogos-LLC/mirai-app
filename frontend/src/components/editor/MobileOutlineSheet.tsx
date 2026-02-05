'use client';

import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Menu,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { OutlineSection } from '@/gen/mirai/v1/ai_generation_types_pb';
import type { LessonListItem } from './OutlineSidebar';

interface MobileOutlineSheetProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  outline: { sections?: OutlineSection[] };
  lessonsList: LessonListItem[];
  expandedSections: Set<number>;
  selectedLessonId: string | null;
  onLessonSelect: (id: string) => void;
  onToggleSection: (idx: number) => void;
}

export function MobileOutlineSheet({
  isOpen,
  onOpen,
  onClose,
  outline,
  lessonsList,
  expandedSections,
  selectedLessonId,
  onLessonSelect,
  onToggleSection,
}: MobileOutlineSheetProps) {
  return (
    <>
      {/* Mobile FAB button - positioned above bottom nav */}
      <button
        onClick={onOpen}
        className="lg:hidden fixed z-40 p-4 bg-primary-600 text-white rounded-full shadow-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
        style={{ bottom: 'calc(var(--bottom-nav-height) + var(--safe-area-bottom) + 1rem)', left: '1rem' }}
        aria-label="Open course outline"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile navigation sheet */}
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title="Course Outline"
        height="half"
      >
        <nav className="space-y-2">
          {outline?.sections?.map((section: OutlineSection, sectionIndex: number) => {
            const isExpanded = expandedSections.has(sectionIndex);
            const sectionLessons = lessonsList.filter((l) => l.sectionIndex === sectionIndex);

            return (
              <div key={section.id} className="mb-1">
                <button
                  onClick={() => onToggleSection(sectionIndex)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-hover transition-colors rounded-lg min-h-[44px]"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-muted" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted" />
                  )}
                  <span className="text-base font-medium text-primary truncate">
                    {section.title}
                  </span>
                </button>

                {isExpanded && (
                  <div className="ml-4 space-y-1">
                    {sectionLessons.map((lesson) => {
                      const isActive = lesson.id === selectedLessonId;
                      const hasContent = !!lesson.generated;

                      return (
                        <button
                          key={lesson.id}
                          onClick={() => {
                            onLessonSelect(lesson.id);
                            onClose();
                          }}
                          disabled={!hasContent}
                          className={`
                            w-full flex items-center gap-2 px-4 py-3 text-left text-base transition-colors rounded-lg min-h-[44px]
                            ${isActive ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600' : 'hover:bg-hover text-secondary'}
                            ${!hasContent ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                        >
                          <FileText className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{lesson.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </BottomSheet>
    </>
  );
}
