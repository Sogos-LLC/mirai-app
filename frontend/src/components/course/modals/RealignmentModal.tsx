'use client';

import React, { useState, useCallback } from 'react';
import { Check, Loader2, Target, BookOpen, MessageSquare } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import Button from '@/components/ui/Button';
import type { SMEPersona, AudiencePersona } from '@/gen/mirai/v1/course_wizard_pb';
import type { LessonComponent } from '@/gen/mirai/v1/ai_generation_pb';

export interface LearningObjective {
  id: string;
  text: string;
}

export interface RealignParams {
  componentId: string;
  personaIds: string[];
  learningObjectiveIds: string[];
  customPrompt: string;
}

interface RealignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  component: LessonComponent | null;
  smePersonas: SMEPersona[];
  audiencePersonas: AudiencePersona[];
  learningObjectives: LearningObjective[];
  onRealign: (params: RealignParams) => Promise<void>;
  isLoading?: boolean;
}

export function RealignmentModal({
  isOpen,
  onClose,
  component,
  smePersonas,
  audiencePersonas,
  learningObjectives,
  onRealign,
  isLoading = false,
}: RealignmentModalProps) {
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Set<string>>(new Set());
  const [selectedLOIds, setSelectedLOIds] = useState<Set<string>>(new Set());
  const [customPrompt, setCustomPrompt] = useState('');

  const togglePersona = useCallback((id: string) => {
    setSelectedPersonaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleLO = useCallback((id: string) => {
    setSelectedLOIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleRealign = async () => {
    if (!component) return;

    await onRealign({
      componentId: component.id,
      personaIds: Array.from(selectedPersonaIds),
      learningObjectiveIds: Array.from(selectedLOIds),
      customPrompt: customPrompt.trim(),
    });

    // Reset state on success
    setSelectedPersonaIds(new Set());
    setSelectedLOIds(new Set());
    setCustomPrompt('');
    onClose();
  };

  const handleClose = () => {
    // Reset state on close
    setSelectedPersonaIds(new Set());
    setSelectedLOIds(new Set());
    setCustomPrompt('');
    onClose();
  };

  const hasSelections = selectedPersonaIds.size > 0 || selectedLOIds.size > 0 || customPrompt.trim().length > 0;
  const allPersonas = [...smePersonas, ...audiencePersonas];

  const footer = (
    <div className="flex justify-end gap-3">
      <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleRealign}
        disabled={isLoading || !hasSelections}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Regenerating...
          </>
        ) : (
          'Regenerate with Alignment'
        )}
      </Button>
    </div>
  );

  if (!component) return null;

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Realign Content"
      size="lg"
      mobileHeight="full"
      footer={footer}
    >
      <div className="space-y-6">
        {/* Info Box */}
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Select personas and learning objectives to realign this content. The AI will regenerate
            the content to better target your selections.
          </p>
        </div>

        {/* Target Personas Section */}
        {allPersonas.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-primary-600" />
              <h3 className="text-sm font-semibold text-primary">Target Personas</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {allPersonas.map((persona) => {
                const isSelected = selectedPersonaIds.has(persona.id);
                const isSME = smePersonas.some((p) => p.id === persona.id);
                return (
                  <button
                    key={persona.id}
                    onClick={() => togglePersona(persona.id)}
                    className={`
                      flex items-center gap-2 px-3 py-2 text-sm rounded-lg border-2 transition-all
                      ${isSelected
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'border-gray-200 dark:border-dark-border bg-surface hover:border-gray-300 dark:hover:border-dark-400'
                      }
                    `}
                  >
                    <div
                      className={`
                        w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                        ${isSelected
                          ? 'bg-primary-600 border-primary-600'
                          : 'border-gray-300 dark:border-dark-border'
                        }
                      `}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="text-left">
                      <span className="font-medium">
                        {isSME ? (persona as SMEPersona).jobTitle : (persona as AudiencePersona).name}
                      </span>
                      <span className="ml-1 text-xs text-muted">
                        ({isSME ? 'SME' : 'Audience'})
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Learning Objectives Section */}
        {learningObjectives.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-primary-600" />
              <h3 className="text-sm font-semibold text-primary">Learning Objectives</h3>
            </div>
            <div className="space-y-2">
              {learningObjectives.map((lo) => {
                const isSelected = selectedLOIds.has(lo.id);
                return (
                  <button
                    key={lo.id}
                    onClick={() => toggleLO(lo.id)}
                    className={`
                      w-full flex items-start gap-3 p-3 text-sm rounded-lg border-2 transition-all text-left
                      ${isSelected
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                        : 'border-gray-200 dark:border-dark-border bg-surface hover:border-gray-300 dark:hover:border-dark-400'
                      }
                    `}
                  >
                    <div
                      className={`
                        w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0
                        ${isSelected
                          ? 'bg-primary-600 border-primary-600'
                          : 'border-gray-300 dark:border-dark-border'
                        }
                      `}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={isSelected ? 'text-primary-700 dark:text-primary-300' : 'text-secondary'}>
                      {lo.text}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Additional Instructions Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-primary">Additional Instructions</h3>
            <span className="text-xs text-muted">(Optional)</span>
          </div>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Any specific instructions for the regeneration..."
            rows={3}
            className="w-full px-4 py-3 text-sm border rounded-lg outline-none transition-all
              bg-white dark:bg-dark-400
              border-gray-300 dark:border-dark-border-input
              text-gray-900 dark:text-dark-text
              placeholder:text-gray-400 dark:placeholder:text-dark-text-muted
              focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400
              focus:border-transparent resize-none"
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}

export default RealignmentModal;
