'use client';

import React from 'react';
import { Sparkles, Wand2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import WizardNavigation from '../WizardNavigation';

interface CourseNameStepProps {
  courseName: string;
  desiredOutcomes: string;
  onCourseNameChange: (name: string) => void;
  onDesiredOutcomesChange: (outcomes: string) => void;
  onGenerateOutcomes: () => void;
  onNext: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isGeneratingOutcomes?: boolean;
}

export default function CourseNameStep({
  courseName,
  desiredOutcomes,
  onCourseNameChange,
  onDesiredOutcomesChange,
  onGenerateOutcomes,
  onNext,
  onCancel,
  isLoading = false,
  isGeneratingOutcomes = false,
}: CourseNameStepProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (courseName.trim().length > 0) {
      onNext();
    }
  };

  return (
    <Card>
      <CardContent className="py-8">
        <div className="max-w-xl mx-auto text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-primary-600" />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-primary mb-2">
            What would you like to teach?
          </h2>
          <p className="text-sm sm:text-base text-secondary mb-8">
            Enter a course name or topic. Our AI will help you refine it and generate
            engaging content.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Input
                type="text"
                placeholder="e.g., Introduction to Machine Learning, Leadership Skills for Managers"
                value={courseName}
                onChange={(e) => onCourseNameChange(e.target.value)}
                autoFocus
              />
              <p className="text-sm text-muted mt-2">
                Don&apos;t worry about getting it perfect - you can refine it in the next step.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-primary">
                  Desired Course Outcomes
                </label>
                <button
                  type="button"
                  onClick={onGenerateOutcomes}
                  disabled={!courseName.trim() || isGeneratingOutcomes}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                    bg-primary-50 text-primary-700 hover:bg-primary-100
                    dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors"
                  title="Generate outcomes from course name"
                >
                  {isGeneratingOutcomes ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  {isGeneratingOutcomes ? 'Generating...' : 'Generate'}
                </button>
              </div>
              <textarea
                value={desiredOutcomes}
                onChange={(e) => onDesiredOutcomesChange(e.target.value)}
                placeholder="• Learners will be able to identify key concepts...
• Learners will understand how to apply...
• Learners will demonstrate proficiency in..."
                rows={5}
                className="w-full px-4 py-3 text-base border rounded-lg outline-none transition-all
                  bg-white dark:bg-dark-400
                  border-gray-300 dark:border-dark-border-input
                  text-gray-900 dark:text-dark-text
                  placeholder:text-gray-400 dark:placeholder:text-dark-text-muted
                  focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400
                  focus:border-transparent resize-none"
              />
              <p className="text-sm text-muted mt-2">
                These outcomes serve as the north star guiding all content generation.
              </p>
            </div>
          </form>
        </div>

        <WizardNavigation
          onCancel={onCancel}
          onNext={onNext}
          canGoBack={false}
          canGoNext={courseName.trim().length > 0}
          isLoading={isLoading}
          nextLabel="Generate Title"
        />
      </CardContent>
    </Card>
  );
}
