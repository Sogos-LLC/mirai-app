'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Menu,
  Pencil,
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
  onRenameSection?: (sectionId: string, newTitle: string) => void;
  onRenameLesson?: (lessonId: string, newTitle: string) => void;
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
  onRenameSection,
  onRenameLesson,
}: MobileOutlineSheetProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEdit = useCallback((id: string, currentTitle: string) => {
    setEditingId(id);
    setEditValue(currentTitle);
  }, []);

  const commitEdit = useCallback((id: string, type: 'section' | 'lesson', originalTitle: string) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== originalTitle) {
      if (type === 'section') {
        onRenameSection?.(id, trimmed);
      } else {
        onRenameLesson?.(id, trimmed);
      }
    }
    setEditingId(null);
  }, [editValue, onRenameSection, onRenameLesson]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, id: string, type: 'section' | 'lesson', originalTitle: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(id, type, originalTitle);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }, [commitEdit, cancelEdit]);

  // Clear edit state when sheet closes
  useEffect(() => {
    if (!isOpen) setEditingId(null);
  }, [isOpen]);

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
            const isEditingSection = editingId === section.id;

            return (
              <div key={section.id} className="mb-1">
                <div className="w-full flex items-center gap-2 px-4 py-3 hover:bg-hover transition-colors rounded-lg min-h-[44px]">
                  <button
                    onClick={() => onToggleSection(sectionIndex)}
                    className="flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center -m-2"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-muted" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted" />
                    )}
                  </button>

                  {isEditingSection ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(section.id, 'section', section.title)}
                      onKeyDown={(e) => handleKeyDown(e, section.id, 'section', section.title)}
                      className="flex-1 min-w-0 text-base font-medium text-primary bg-transparent border-b-2 border-primary-500 outline-none py-0"
                    />
                  ) : (
                    <>
                      <button
                        onClick={() => onToggleSection(sectionIndex)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className="text-base font-medium text-primary truncate block">
                          {section.title}
                        </span>
                      </button>

                      {onRenameSection && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(section.id, section.title);
                          }}
                          className="flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center -m-2"
                          title="Edit section title"
                        >
                          <Pencil className="w-4 h-4 text-muted" />
                        </button>
                      )}
                    </>
                  )}
                </div>

                {isExpanded && (
                  <div className="ml-4 space-y-1">
                    {sectionLessons.map((lesson) => {
                      const isActive = lesson.id === selectedLessonId;
                      const hasContent = !!lesson.generated;
                      const isEditingLesson = editingId === lesson.id;

                      return (
                        <div
                          key={lesson.id}
                          className={`
                            w-full flex items-center gap-2 px-4 py-3 text-left text-base transition-colors rounded-lg min-h-[44px]
                            ${isActive ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600' : 'hover:bg-hover text-secondary'}
                            ${!hasContent && !isEditingLesson ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                        >
                          <FileText className="w-4 h-4 flex-shrink-0" />

                          {isEditingLesson ? (
                            <input
                              ref={inputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(lesson.id, 'lesson', lesson.title)}
                              onKeyDown={(e) => handleKeyDown(e, lesson.id, 'lesson', lesson.title)}
                              className="flex-1 min-w-0 text-base text-primary bg-transparent border-b-2 border-primary-500 outline-none py-0"
                            />
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  if (hasContent) {
                                    onLessonSelect(lesson.id);
                                    onClose();
                                  }
                                }}
                                disabled={!hasContent}
                                className="flex-1 min-w-0 text-left truncate"
                              >
                                {lesson.title}
                              </button>

                              {onRenameLesson && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEdit(lesson.id, lesson.title);
                                  }}
                                  className="flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center -m-2"
                                  title="Edit lesson title"
                                >
                                  <Pencil className="w-4 h-4 text-muted" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
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
