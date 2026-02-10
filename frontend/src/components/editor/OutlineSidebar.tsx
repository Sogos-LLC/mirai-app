'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Pencil,
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
  effectiveGroundings?: Map<string, number>;
  onRenameSection?: (sectionId: string, newTitle: string) => void;
  onRenameLesson?: (lessonId: string, newTitle: string) => void;
}

export function OutlineSidebar({
  outline,
  lessonsList,
  expandedSections,
  selectedLessonId,
  onLessonSelect,
  onToggleSection,
  effectiveGroundings,
  onRenameSection,
  onRenameLesson,
}: OutlineSidebarProps) {
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

  return (
    <aside className="w-80 flex-shrink-0 hidden lg:block">
      <Card>
        <CardHeader className="py-3">
          <CardTitle as="h3">Course Outline</CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-0">
          <nav className="max-h-[calc(100vh-20rem)] overflow-y-auto">
            {outline.sections?.map((section: OutlineSection, sectionIndex: number) => {
              const isExpanded = expandedSections.has(sectionIndex);
              const sectionLessons = lessonsList.filter((l) => l.sectionIndex === sectionIndex);
              const isEditingSection = editingId === section.id;

              return (
                <div key={section.id} className="mb-1">
                  <div className="group w-full flex items-center gap-2 px-4 py-2 hover:bg-surface transition-colors">
                    <button
                      onClick={() => onToggleSection(sectionIndex)}
                      className="flex-shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted" />
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
                        className="flex-1 min-w-0 text-sm font-medium text-primary bg-transparent border-b-2 border-primary-500 outline-none py-0"
                      />
                    ) : (
                      <button
                        onClick={() => onToggleSection(sectionIndex)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (onRenameSection) startEdit(section.id, section.title);
                        }}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className="text-sm font-medium text-primary truncate block">
                          {section.title}
                        </span>
                      </button>
                    )}

                    {!isEditingSection && onRenameSection && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(section.id, section.title);
                        }}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Edit section title"
                      >
                        <Pencil className="w-3 h-3 text-muted" />
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="ml-4">
                      {sectionLessons.map((lesson) => {
                        const isActive = lesson.id === selectedLessonId;
                        const hasContent = !!lesson.generated;
                        const gScore = effectiveGroundings?.get(lesson.id)
                          ?? lesson.generated?.groundingScore
                          ?? 0;
                        const isEditingLesson = editingId === lesson.id;

                        return (
                          <div
                            key={lesson.id}
                            className={`
                              group w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors
                              ${isActive ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600' : 'hover:bg-surface text-secondary'}
                              ${!hasContent && !isEditingLesson ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                          >
                            <FileText className="w-3 h-3 flex-shrink-0" />

                            {isEditingLesson ? (
                              <input
                                ref={inputRef}
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => commitEdit(lesson.id, 'lesson', lesson.title)}
                                onKeyDown={(e) => handleKeyDown(e, lesson.id, 'lesson', lesson.title)}
                                className="flex-1 min-w-0 text-sm text-primary bg-transparent border-b-2 border-primary-500 outline-none py-0"
                              />
                            ) : (
                              <button
                                onClick={() => {
                                  if (hasContent) onLessonSelect(lesson.id);
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (onRenameLesson) startEdit(lesson.id, lesson.title);
                                }}
                                disabled={!hasContent}
                                className="flex-1 min-w-0 text-left truncate"
                              >
                                {lesson.title}
                              </button>
                            )}

                            {!isEditingLesson && onRenameLesson && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEdit(lesson.id, lesson.title);
                                }}
                                className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Edit lesson title"
                              >
                                <Pencil className="w-3 h-3 text-muted" />
                              </button>
                            )}

                            {!isEditingLesson && hasContent && gScore > 0 && (
                              <span
                                className={`flex-shrink-0 w-2 h-2 rounded-full ${
                                  gScore >= 0.6 ? 'bg-green-500' : gScore >= 0.3 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                title={`${Math.round(gScore * 100)}% grounded`}
                              />
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
        </CardContent>
      </Card>
    </aside>
  );
}
