'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  Pencil,
  Check,
  X,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import type { OutlineSection } from '@/gen/mirai/v1/ai_generation_types_pb';
import {
  SectionLevel,
  SectionIntent,
  SectionEmphasis,
} from '@/gen/mirai/v1/ai_generation_types_pb';
import SectionMetadataBadges from '@/components/outline/SectionMetadataBadges';
import SectionFeedbackControls, { type SectionFeedbackData } from '@/components/outline/SectionFeedbackControls';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { LessonSourcePanel } from '@/components/lessons/LessonSourcePanel';

interface EditState {
  type: 'section' | 'lesson';
  sectionIndex: number;
  lessonIndex?: number;
  title: string;
  description?: string;
}

interface AvailableOutcome {
  id: string;
  text: string;
}

interface OutlineSectionCardProps {
  section: OutlineSection;
  sectionIndex: number;
  isExpanded: boolean;
  isTouch: boolean;
  availableOutcomes: AvailableOutcome[];
  onToggle: () => void;
  onUpdateSectionTitle: (sectionIndex: number, title: string) => void;
  onUpdateLesson: (sectionIndex: number, lessonIndex: number, title: string, description: string) => void;
  onSaveSectionFeedback: (sectionIndex: number, data: SectionFeedbackData) => void;
  onShowSectionSources: (sectionIndex: number) => void;
}

export function OutlineSectionCard({
  section,
  sectionIndex,
  isExpanded,
  isTouch,
  availableOutcomes,
  onToggle,
  onUpdateSectionTitle,
  onUpdateLesson,
  onSaveSectionFeedback,
  onShowSectionSources,
}: OutlineSectionCardProps) {
  const [editState, setEditState] = useState<EditState | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [openSourcePanel, setOpenSourcePanel] = useState<number | null>(null);

  const isEditingSection = editState?.type === 'section' && editState.sectionIndex === sectionIndex;

  const getSectionFeedbackData = (): SectionFeedbackData => ({
    level: section.level ?? SectionLevel.UNSPECIFIED,
    intent: section.intent ?? SectionIntent.UNSPECIFIED,
    emphasis: section.emphasis ?? SectionEmphasis.UNSPECIFIED,
    mappedOutcomeIds: section.mappedOutcomeIds ?? [],
  });

  return (
    <div className="bg-surface">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggle}
          className="flex-shrink-0 p-3 hover:bg-hover transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-muted" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted" />
          )}
        </button>

        {isEditingSection ? (
          <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 py-2 pr-2 sm:pr-4">
            <input
              type="text"
              value={editState.title}
              onChange={(e) => setEditState({ ...editState, title: e.target.value })}
              className="flex-1 px-3 py-2 text-sm font-semibold border rounded bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onUpdateSectionTitle(sectionIndex, editState.title);
                  setEditState(null);
                } else if (e.key === 'Escape') {
                  setEditState(null);
                }
              }}
            />
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  onUpdateSectionTitle(sectionIndex, editState.title);
                  setEditState(null);
                }}
                className="flex-1 sm:flex-none p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                onClick={() => setEditState(null)}
                className="flex-1 sm:flex-none p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 py-3 pr-4 min-h-[44px] flex flex-col justify-center">
            <div
              className="cursor-pointer group"
              onClick={() => setEditState({
                type: 'section',
                sectionIndex,
                title: section.title || `Section ${sectionIndex + 1}`,
              })}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-muted">
                  Section {sectionIndex + 1}
                </span>
                <span className="text-xs text-muted">
                  ({section.lessons?.length ?? 0} lessons)
                </span>
                <Pencil className={`w-3 h-3 text-muted transition-opacity ${isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'}`} />
              </div>
              <h3 className="font-semibold text-primary">
                {section.title || `Section ${sectionIndex + 1}`}
              </h3>
            </div>

            {/* Section Metadata Badges */}
            <div className="flex items-center gap-2 mt-2">
              <SectionMetadataBadges
                level={section.level}
                intent={section.intent}
                groundingScore={section.groundingScore}
                contributingChunkIds={section.contributingChunkIds}
                compact={false}
                onShowSources={() => onShowSectionSources(sectionIndex)}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFeedbackOpen(true);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Edit</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section Feedback Modal */}
      <ResponsiveModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        title={`Section Feedback: ${section.title || `Section ${sectionIndex + 1}`}`}
        size="lg"
        mobileHeight="full"
      >
        <SectionFeedbackControls
          initialData={getSectionFeedbackData()}
          availableOutcomes={availableOutcomes}
          onSave={(data) => {
            onSaveSectionFeedback(sectionIndex, data);
            setFeedbackOpen(false);
          }}
          onCancel={() => setFeedbackOpen(false)}
        />
      </ResponsiveModal>

      {isExpanded && section.lessons && (
        <div className="px-2 sm:px-4 pb-3">
          <div className="ml-4 sm:ml-8 space-y-2">
            {section.lessons.map((lesson, lessonIndex) => {
              const isEditingLesson = editState?.type === 'lesson' &&
                editState.sectionIndex === sectionIndex &&
                editState.lessonIndex === lessonIndex;

              return (
                <div key={lessonIndex}>
                  {isEditingLesson ? (
                    <div className="p-3 border rounded bg-surface space-y-3">
                      <input
                        type="text"
                        value={editState.title}
                        onChange={(e) => setEditState({ ...editState, title: e.target.value })}
                        className="w-full px-3 py-2 text-sm font-medium border rounded bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                        placeholder="Lesson title"
                        autoFocus
                      />
                      <textarea
                        value={editState.description || ''}
                        onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                        className="w-full px-3 py-2 text-sm border rounded bg-surface text-secondary focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y min-h-[80px]"
                        placeholder="Lesson description (optional)"
                        rows={3}
                      />
                      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                        <button
                          onClick={() => setEditState(null)}
                          className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-sm text-secondary hover:bg-hover rounded"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            onUpdateLesson(sectionIndex, lessonIndex, editState.title, editState.description || '');
                            setEditState(null);
                          }}
                          className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-start gap-3 p-2 rounded hover:bg-hover cursor-pointer group min-h-[44px]"
                      onClick={() => setEditState({
                        type: 'lesson',
                        sectionIndex,
                        lessonIndex,
                        title: lesson.title || `Lesson ${lessonIndex + 1}`,
                        description: lesson.description || '',
                      })}
                    >
                      <BookOpen className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-primary">
                            {lesson.title || `Lesson ${lessonIndex + 1}`}
                          </p>
                          <Pencil className={`w-3 h-3 text-muted transition-opacity ${isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'}`} />
                          {/* Grounding indicator */}
                          {lesson.groundingScore > 0 && (
                            <span
                              className={`px-1.5 py-0.5 text-xs rounded ${
                                lesson.groundingScore >= 0.8
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : lesson.groundingScore >= 0.6
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              }`}
                              title={`${Math.round(lesson.groundingScore * 100)}% grounded in knowledge sources`}
                            >
                              {Math.round(lesson.groundingScore * 100)}%
                            </span>
                          )}
                          {/* Citation indicator with source panel */}
                          {lesson.citations && lesson.citations.length > 0 && (
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() =>
                                  setOpenSourcePanel(
                                    openSourcePanel === lessonIndex ? null : lessonIndex
                                  )
                                }
                                className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                                title={`${lesson.citations.length} knowledge source${lesson.citations.length > 1 ? 's' : ''}`}
                              >
                                <FileText className="w-3 h-3" />
                                <span>{lesson.citations.length}</span>
                              </button>
                              <LessonSourcePanel
                                citations={lesson.citations.map((c: { sourceId: string; sourceName: string; excerpt: string; relevanceScore: number }) => ({
                                  sourceId: c.sourceId || '',
                                  sourceName: c.sourceName || '',
                                  excerpt: c.excerpt || '',
                                  relevanceScore: c.relevanceScore || 0,
                                }))}
                                groundingScore={lesson.groundingScore}
                                isOpen={openSourcePanel === lessonIndex}
                                onClose={() => setOpenSourcePanel(null)}
                              />
                            </div>
                          )}
                        </div>
                        {lesson.description && (
                          <p className="text-xs text-secondary line-clamp-2">
                            {lesson.description}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
