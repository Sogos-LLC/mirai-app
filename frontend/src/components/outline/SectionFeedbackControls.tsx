'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Target, Lightbulb, GraduationCap, Award, BookOpen, PenTool, RotateCcw } from 'lucide-react';
import { SectionLevel, SectionIntent, SectionEmphasis } from '@/gen/mirai/v1/ai_generation_types_pb';
import Button from '@/components/ui/Button';

export interface SectionFeedbackData {
  level: SectionLevel;
  intent: SectionIntent;
  emphasis: SectionEmphasis;
  mappedOutcomeIds: string[];
  isRedundant?: boolean;
  missingPrerequisite?: boolean;
  feedbackNotes?: string;
}

export interface SectionFeedbackControlsProps {
  /** Current section metadata */
  initialData: SectionFeedbackData;
  /** Available outcomes to map to */
  availableOutcomes: Array<{ id: string; text: string }>;
  /** Called when user saves changes */
  onSave: (data: SectionFeedbackData) => void;
  /** Called when user cancels */
  onCancel: () => void;
  /** Section title for context */
  sectionTitle: string;
}

/**
 * Feedback controls for modifying section metadata.
 * Allows users to adjust level, intent, emphasis, and outcome mappings.
 */
export default function SectionFeedbackControls({
  initialData,
  availableOutcomes,
  onSave,
  onCancel,
  sectionTitle,
}: SectionFeedbackControlsProps) {
  const [data, setData] = useState<SectionFeedbackData>(initialData);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleToggleOutcome = (outcomeId: string) => {
    setData(prev => ({
      ...prev,
      mappedOutcomeIds: prev.mappedOutcomeIds.includes(outcomeId)
        ? prev.mappedOutcomeIds.filter(id => id !== outcomeId)
        : [...prev.mappedOutcomeIds, outcomeId],
    }));
  };

  const levelOptions = [
    { value: SectionLevel.INTRODUCE, label: 'Introduce', icon: Lightbulb, description: 'First exposure to concepts' },
    { value: SectionLevel.DEVELOP, label: 'Develop', icon: GraduationCap, description: 'Building understanding' },
    { value: SectionLevel.MASTER, label: 'Master', icon: Award, description: 'Deep proficiency' },
  ];

  const intentOptions = [
    { value: SectionIntent.TEACH, label: 'Teaching', icon: BookOpen, description: 'Primary instruction' },
    { value: SectionIntent.ASSESS, label: 'Assessment', icon: PenTool, description: 'Evaluation/testing' },
    { value: SectionIntent.REINFORCE, label: 'Practice', icon: RotateCcw, description: 'Reinforcement' },
  ];

  return (
    <div className="bg-surface border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-primary">Section Feedback: {sectionTitle}</h4>
      </div>

      {/* Learning Level */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-2">Learning Level</label>
        <div className="flex flex-wrap gap-2">
          {levelOptions.map(option => {
            const Icon = option.icon;
            const isSelected = data.level === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setData(prev => ({ ...prev, level: option.value }))}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors min-h-[44px] ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                    : 'border-subtle bg-surface hover:bg-hover text-secondary'
                }`}
                title={option.description}
              >
                <Icon className="w-4 h-4" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section Intent */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-2">Primary Intent</label>
        <div className="flex flex-wrap gap-2">
          {intentOptions.map(option => {
            const Icon = option.icon;
            const isSelected = data.intent === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setData(prev => ({ ...prev, intent: option.value }))}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors min-h-[44px] ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                    : 'border-subtle bg-surface hover:bg-hover text-secondary'
                }`}
                title={option.description}
              >
                <Icon className="w-4 h-4" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Emphasis Slider */}
      <div>
        <label className="block text-xs font-medium text-secondary mb-2">
          Relative Emphasis
        </label>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted">Low</span>
          <div className="flex-1 flex gap-1">
            {[SectionEmphasis.LOW, SectionEmphasis.MEDIUM, SectionEmphasis.HIGH].map((level, idx) => (
              <button
                key={level}
                onClick={() => setData(prev => ({ ...prev, emphasis: level }))}
                className={`flex-1 h-2 rounded transition-colors ${
                  (data.emphasis === SectionEmphasis.LOW && idx === 0) ||
                  (data.emphasis === SectionEmphasis.MEDIUM && idx <= 1) ||
                  (data.emphasis === SectionEmphasis.HIGH && idx <= 2)
                    ? 'bg-indigo-500'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
                title={level === SectionEmphasis.LOW ? 'Low' : level === SectionEmphasis.MEDIUM ? 'Medium' : 'High'}
              />
            ))}
          </div>
          <span className="text-xs text-muted">High</span>
        </div>
      </div>

      {/* Outcome Mappings */}
      {availableOutcomes.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-secondary mb-2">
            <Target className="w-3 h-3 inline mr-1" />
            Maps to Outcomes
          </label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-page rounded border">
            {availableOutcomes.map(outcome => {
              const isSelected = data.mappedOutcomeIds.includes(outcome.id);
              return (
                <button
                  key={outcome.id}
                  onClick={() => handleToggleOutcome(outcome.id)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    isSelected
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700'
                      : 'bg-surface border border-subtle text-secondary hover:bg-hover'
                  }`}
                  title={outcome.text}
                >
                  {outcome.text.length > 40 ? outcome.text.slice(0, 40) + '...' : outcome.text}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Advanced Options */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-xs text-muted hover:text-secondary transition-colors"
      >
        {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Advanced feedback
      </button>

      {showAdvanced && (
        <div className="space-y-3 pt-2 border-t border-subtle">
          {/* Flags */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={data.isRedundant ?? false}
                onChange={(e) => setData(prev => ({ ...prev, isRedundant: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-secondary">Mark as redundant</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={data.missingPrerequisite ?? false}
                onChange={(e) => setData(prev => ({ ...prev, missingPrerequisite: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-secondary">Missing prerequisite</span>
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              Feedback notes (optional)
            </label>
            <textarea
              value={data.feedbackNotes ?? ''}
              onChange={(e) => setData(prev => ({ ...prev, feedbackNotes: e.target.value }))}
              placeholder="Add specific feedback for regeneration..."
              className="w-full px-3 py-2 text-sm border rounded bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y min-h-[60px]"
              rows={2}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-subtle">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={() => onSave(data)}>
          Save Feedback
        </Button>
      </div>
    </div>
  );
}
