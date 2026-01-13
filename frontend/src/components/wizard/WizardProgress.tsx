'use client';

import React from 'react';
import { CheckCircle, FileText, Sparkles, Users, Target, Palette, Loader2 } from 'lucide-react';
import type { WizardStep } from '@/machines/courseWizardMachine';
import { getStepNumber, getAllSteps, getStepLabel } from '@/machines/courseWizardMachine';

interface WizardProgressProps {
  currentStep: WizardStep;
  isGenerating?: boolean;
}

const stepIcons: Record<WizardStep, React.ComponentType<{ className?: string }>> = {
  courseName: FileText,
  titleDescription: Sparkles,
  smeSelection: Users,
  audienceSelection: Target,
  toneSelection: Palette,
  outlineJobQueued: Loader2,
};

export default function WizardProgress({ currentStep, isGenerating = false }: WizardProgressProps) {
  const allSteps = getAllSteps();
  const currentStepNumber = getStepNumber(currentStep);

  return (
    <div className="mb-8">
      {/* Desktop view - horizontal steps */}
      <div className="hidden sm:flex items-center justify-between">
        {allSteps.map((step, index) => {
          const Icon = stepIcons[step];
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStepNumber;
          const isCurrent = step === currentStep;
          const isPast = stepNumber < currentStepNumber;

          return (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center transition-colors
                    ${isCompleted || isPast
                      ? 'bg-primary-600 text-white'
                      : isCurrent
                        ? 'bg-primary-100 text-primary-600 border-2 border-primary-600'
                        : 'bg-surface border-2 text-muted'
                    }
                    ${isCurrent && isGenerating ? 'animate-pulse' : ''}
                  `}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={`
                    mt-2 text-xs font-medium
                    ${isCurrent ? 'text-primary' : 'text-muted'}
                  `}
                >
                  {getStepLabel(step)}
                </span>
              </div>
              {index < allSteps.length - 1 && (
                <div
                  className={`
                    flex-1 h-0.5 mx-2
                    ${isPast ? 'bg-primary-600' : 'bg-surface border-t-2 border-dashed'}
                  `}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile view - compact progress */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-primary">
            Step {currentStepNumber} of {allSteps.length}
          </span>
          <span className="text-sm text-secondary">
            {getStepLabel(currentStep)}
          </span>
        </div>
        <div className="w-full bg-surface rounded-full h-2 border">
          <div
            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentStepNumber / allSteps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
