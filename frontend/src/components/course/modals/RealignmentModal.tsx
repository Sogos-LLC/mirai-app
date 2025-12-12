'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Check, Loader2, Target, BookOpen, MessageSquare, Plus, X, ChevronDown, User, Users } from 'lucide-react';
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
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPersonaDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addPersona = useCallback((id: string) => {
    setSelectedPersonaIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setShowPersonaDropdown(false);
  }, []);

  const removePersona = useCallback((id: string) => {
    setSelectedPersonaIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
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
    setShowPersonaDropdown(false);
    onClose();
  };

  // Get selected personas with their display info
  const selectedPersonas = Array.from(selectedPersonaIds).map((id) => {
    const sme = smePersonas.find((p) => p.id === id);
    if (sme) return { id, name: sme.jobTitle, type: 'SME' as const };
    const audience = audiencePersonas.find((p) => p.id === id);
    if (audience) return { id, name: audience.name, type: 'Audience' as const };
    return null;
  }).filter(Boolean) as Array<{ id: string; name: string; type: 'SME' | 'Audience' }>;

  // Get available personas (not yet selected)
  const availableSMEs = smePersonas.filter((p) => !selectedPersonaIds.has(p.id));
  const availableAudiences = audiencePersonas.filter((p) => !selectedPersonaIds.has(p.id));
  const hasAvailablePersonas = availableSMEs.length > 0 || availableAudiences.length > 0;

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
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-primary">Target Personas</h3>
          </div>

          {/* Selected personas as removable tags */}
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedPersonas.map((persona) => (
              <span
                key={persona.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-full"
              >
                {persona.type === 'SME' ? (
                  <User className="w-3 h-3" />
                ) : (
                  <Users className="w-3 h-3" />
                )}
                <span>{persona.name}</span>
                <span className="text-xs text-primary-500 dark:text-primary-400">({persona.type})</span>
                <button
                  onClick={() => removePersona(persona.id)}
                  className="ml-1 p-0.5 hover:bg-primary-200 dark:hover:bg-primary-800 rounded-full transition-colors"
                  aria-label={`Remove ${persona.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {/* Add Persona dropdown button */}
            {(allPersonas.length > 0 && hasAvailablePersonas) && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowPersonaDropdown(!showPersonaDropdown)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border-2 border-dashed border-gray-300 dark:border-dark-border text-secondary hover:border-primary-400 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:text-primary-400 rounded-full transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Persona</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showPersonaDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown menu */}
                {showPersonaDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-64 bg-surface border border-default rounded-lg shadow-lg z-30 max-h-64 overflow-y-auto">
                    {availableSMEs.length > 0 && (
                      <>
                        <div className="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide bg-gray-50 dark:bg-dark-400 border-b border-default">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3" />
                            Subject Matter Experts
                          </div>
                        </div>
                        {availableSMEs.map((sme) => (
                          <button
                            key={sme.id}
                            onClick={() => addPersona(sme.id)}
                            className="w-full px-3 py-2 text-left text-sm text-secondary hover:bg-hover transition-colors flex items-center gap-2"
                          >
                            <span className="font-medium">{sme.jobTitle}</span>
                          </button>
                        ))}
                      </>
                    )}
                    {availableAudiences.length > 0 && (
                      <>
                        <div className={`px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide bg-gray-50 dark:bg-dark-400 border-b border-default ${availableSMEs.length > 0 ? 'border-t' : ''}`}>
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3 h-3" />
                            Audience
                          </div>
                        </div>
                        {availableAudiences.map((audience) => (
                          <button
                            key={audience.id}
                            onClick={() => addPersona(audience.id)}
                            className="w-full px-3 py-2 text-left text-sm text-secondary hover:bg-hover transition-colors flex items-center gap-2"
                          >
                            <span className="font-medium">{audience.name}</span>
                            {audience.role && (
                              <span className="text-xs text-muted">({audience.role})</span>
                            )}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Empty state message */}
          {allPersonas.length === 0 && (
            <p className="text-sm text-muted italic">
              No personas available. Use the learning objectives or additional instructions below.
            </p>
          )}
          {allPersonas.length > 0 && selectedPersonas.length === 0 && !hasAvailablePersonas && (
            <p className="text-sm text-muted italic">
              All personas have been selected.
            </p>
          )}
        </div>

        {/* Learning Objectives Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-primary">Learning Objectives</h3>
          </div>
          {learningObjectives.length > 0 ? (
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
          ) : (
            <p className="text-sm text-muted italic">
              No learning objectives found for this lesson.
            </p>
          )}
        </div>

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
