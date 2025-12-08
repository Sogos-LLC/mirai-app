'use client';

import React from 'react';
import { FileText, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import WizardNavigation from '../WizardNavigation';

interface AdditionalContextStepProps {
  context: string;
  onContextChange: (context: string) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function AdditionalContextStep({
  context,
  onContextChange,
  onNext,
  onSkip,
  onBack,
  onCancel,
  isLoading = false,
}: AdditionalContextStepProps) {
  return (
    <Card>
      <CardContent className="py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-primary">
                Additional Context
              </h2>
              <p className="text-sm sm:text-base text-secondary">
                Add any extra details to help guide the course outline.
              </p>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6 flex gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">This step is optional</p>
              <p>
                You can skip this if you&apos;re happy with the defaults. Add context if you have
                specific requirements, prerequisites, or topics you want to emphasize.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Additional Instructions or Context
              </label>
              <textarea
                value={context}
                onChange={(e) => onContextChange(e.target.value)}
                placeholder="Examples:
• Focus more on practical examples than theory
• Include a section on common mistakes to avoid
• The course should be completable in under 2 hours
• Prerequisite: Basic understanding of Python
• Emphasize hands-on exercises"
                rows={8}
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
        </div>

        <WizardNavigation
          onBack={onBack}
          onNext={onNext}
          onSkip={onSkip}
          onCancel={onCancel}
          canGoBack={true}
          canGoNext={true}
          isLoading={isLoading}
          nextLabel="Generate Outline"
          showSkip={true}
          skipLabel="Skip & Generate"
        />
      </CardContent>
    </Card>
  );
}
