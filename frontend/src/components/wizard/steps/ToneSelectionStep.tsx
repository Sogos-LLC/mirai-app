'use client';

import React, { useState } from 'react';
import { Palette, RefreshCw, Check, X, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import type { ToneOption } from '@/gen/mirai/v1/course_wizard_pb';
import { ToneDetailLevel } from '@/gen/mirai/v1/course_wizard_pb';
import WizardNavigation from '../WizardNavigation';

interface ToneSelectionStepProps {
  options: ToneOption[];
  selectedId: string;
  additionalContext: string;
  onSelectTone: (id: string) => void;
  onContextChange: (context: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const detailLevelLabels: Record<ToneDetailLevel, string> = {
  [ToneDetailLevel.UNSPECIFIED]: 'Unspecified',
  [ToneDetailLevel.BRIEF]: 'Brief',
  [ToneDetailLevel.MODERATE]: 'Moderate',
  [ToneDetailLevel.COMPREHENSIVE]: 'Comprehensive',
};

const detailLevelDescriptions: Record<ToneDetailLevel, string> = {
  [ToneDetailLevel.UNSPECIFIED]: '',
  [ToneDetailLevel.BRIEF]: 'Quick, focused lessons for busy learners',
  [ToneDetailLevel.MODERATE]: 'Balanced depth with practical examples',
  [ToneDetailLevel.COMPREHENSIVE]: 'In-depth coverage with extensive details',
};

export default function ToneSelectionStep({
  options,
  selectedId,
  additionalContext,
  onSelectTone,
  onContextChange,
  onNext,
  onBack,
  onSkip,
  onRegenerate,
  onCancel,
  isLoading = false,
}: ToneSelectionStepProps) {
  const [viewingTone, setViewingTone] = useState<ToneOption | null>(null);
  const canProceed = selectedId.length > 0;

  return (
    <>
      <Card>
        <CardContent className="py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Palette className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-primary">
                    Choose Your Course Tone
                  </h2>
                  <p className="text-sm sm:text-base text-secondary">
                    Select how you want your course content to sound and feel.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                disabled={isLoading}
                className="self-start sm:self-auto"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {options.map((option) => {
                const isSelected = selectedId === option.id;

                return (
                  <div
                    key={option.id}
                    onClick={() => onSelectTone(option.id)}
                    className={`
                      p-5 rounded-lg border-2 cursor-pointer transition-all flex flex-col
                      ${isSelected
                        ? 'border-primary-500 bg-primary-50/50'
                        : 'border-transparent bg-surface hover:border-gray-300'
                      }
                    `}
                  >
                    {/* Title area - fixed height */}
                    <div className="flex items-start justify-between mb-3 h-[32px]">
                      <h3 className="font-semibold text-primary text-lg line-clamp-1">{option.name}</h3>
                      <div
                        className={`
                          w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0
                          ${isSelected
                            ? 'bg-primary-600 border-primary-600'
                            : 'border-gray-300'
                          }
                        `}
                      >
                        {isSelected && <Check className="w-4 h-4 text-white" />}
                      </div>
                    </div>

                    {/* Description area - fixed height */}
                    <div className="h-[72px] mb-3">
                      <p className="text-sm text-secondary line-clamp-3">
                        {option.description}
                      </p>
                    </div>

                    {/* View full details button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingTone(option);
                      }}
                      className="text-xs text-primary-600 hover:text-primary-700 hover:underline flex items-center gap-1 mb-3"
                    >
                      <Eye className="w-3 h-3" />
                      View full details
                    </button>

                    {/* Detail level area - fixed height */}
                    <div className="pt-3 border-t h-[72px]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted">Detail Level</span>
                        <span className={`
                          px-2 py-1 text-xs rounded-full
                          ${option.levelOfDetail === ToneDetailLevel.BRIEF
                            ? 'bg-blue-100 text-blue-700'
                            : option.levelOfDetail === ToneDetailLevel.MODERATE
                              ? 'bg-green-100 text-green-700'
                              : option.levelOfDetail === ToneDetailLevel.COMPREHENSIVE
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-gray-100 text-gray-700'
                          }
                        `}>
                          {detailLevelLabels[option.levelOfDetail]}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-1 line-clamp-2">
                        {detailLevelDescriptions[option.levelOfDetail]}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-sm text-muted text-center mb-8">
              The tone you select will influence the writing style, complexity, and detail level of your course content.
            </p>

            {/* Additional Context Section */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-primary mb-2">
                Additional Context (Optional)
              </h3>
              <p className="text-sm text-secondary mb-4">
                Add any extra details to help guide the course outline.
              </p>
              <textarea
                value={additionalContext}
                onChange={(e) => onContextChange(e.target.value)}
                placeholder="Examples:
• Focus more on practical examples than theory
• Include a section on common mistakes to avoid
• The course should be completable in under 2 hours
• Prerequisite: Basic understanding of Python
• Emphasize hands-on exercises"
                rows={6}
                className="w-full px-4 py-3 text-base border rounded-lg outline-none transition-all
                  bg-white dark:bg-dark-400
                  border-gray-300 dark:border-dark-border-input
                  text-gray-900 dark:text-dark-text
                  placeholder:text-gray-400 dark:placeholder:text-dark-text-muted
                  focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400
                  focus:border-transparent resize-none"
              />
              <p className="text-sm text-muted mt-2">
                This information will be used to customize your course outline.
              </p>
            </div>
          </div>

          <WizardNavigation
            onBack={onBack}
            onNext={onNext}
            onSkip={onSkip}
            onCancel={onCancel}
            canGoBack={true}
            canGoNext={canProceed}
            isLoading={isLoading}
            nextLabel="Generate Outline"
            showSkip={true}
            skipLabel="Skip Context & Generate"
          />
        </CardContent>
      </Card>

      {/* Tone Detail Modal */}
      {viewingTone && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingTone(null)}
        >
          <div
            className="bg-surface rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-bold text-primary">{viewingTone.name}</h3>
                <button
                  onClick={() => setViewingTone(null)}
                  className="p-2 rounded hover:bg-hover min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 -mt-2"
                >
                  <X className="w-5 h-5 text-muted" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted mb-1">Description</p>
                  <p className="text-secondary">{viewingTone.description}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted mb-1">Detail Level</p>
                  <div className="flex items-center gap-2">
                    <span className={`
                      px-2 py-1 text-xs rounded-full
                      ${viewingTone.levelOfDetail === ToneDetailLevel.BRIEF
                        ? 'bg-blue-100 text-blue-700'
                        : viewingTone.levelOfDetail === ToneDetailLevel.MODERATE
                          ? 'bg-green-100 text-green-700'
                          : viewingTone.levelOfDetail === ToneDetailLevel.COMPREHENSIVE
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-gray-100 text-gray-700'
                      }
                    `}>
                      {detailLevelLabels[viewingTone.levelOfDetail]}
                    </span>
                    <span className="text-sm text-secondary">
                      {detailLevelDescriptions[viewingTone.levelOfDetail]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setViewingTone(null)}
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    onSelectTone(viewingTone.id);
                    setViewingTone(null);
                  }}
                >
                  Select This Tone
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
