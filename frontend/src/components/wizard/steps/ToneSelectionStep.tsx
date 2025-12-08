'use client';

import React from 'react';
import { Palette, RefreshCw, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import type { ToneOption } from '@/gen/mirai/v1/course_wizard_pb';
import { ToneDetailLevel } from '@/gen/mirai/v1/course_wizard_pb';
import WizardNavigation from '../WizardNavigation';

interface ToneSelectionStepProps {
  options: ToneOption[];
  selectedId: string;
  onSelectTone: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
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
  onSelectTone,
  onNext,
  onBack,
  onRegenerate,
  onCancel,
  isLoading = false,
}: ToneSelectionStepProps) {
  const canProceed = selectedId.length > 0;

  return (
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
                    p-5 rounded-lg border-2 cursor-pointer transition-all
                    ${isSelected
                      ? 'border-primary-500 bg-primary-50/50'
                      : 'border-transparent bg-surface hover:border-gray-300'
                    }
                  `}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-primary text-lg">{option.name}</h3>
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

                  <p className="text-sm text-secondary mb-4">
                    {option.description}
                  </p>

                  <div className="pt-3 border-t">
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
                    <p className="text-xs text-muted mt-1">
                      {detailLevelDescriptions[option.levelOfDetail]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-sm text-muted text-center mb-4">
            The tone you select will influence the writing style, complexity, and detail level of your course content.
          </p>
        </div>

        <WizardNavigation
          onBack={onBack}
          onNext={onNext}
          onCancel={onCancel}
          canGoBack={true}
          canGoNext={canProceed}
          isLoading={isLoading}
          nextLabel="Add Context"
        />
      </CardContent>
    </Card>
  );
}
