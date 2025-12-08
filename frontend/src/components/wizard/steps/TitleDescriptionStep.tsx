'use client';

import React from 'react';
import { Edit2, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import WizardNavigation from '../WizardNavigation';

interface TitleDescriptionStepProps {
  title: string;
  description: string;
  originalCourseName: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onNext: () => void;
  onBack: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function TitleDescriptionStep({
  title,
  description,
  originalCourseName,
  onTitleChange,
  onDescriptionChange,
  onNext,
  onBack,
  onRegenerate,
  onCancel,
  isLoading = false,
}: TitleDescriptionStepProps) {
  const canProceed = title.trim().length > 0 && description.trim().length > 0;

  return (
    <Card>
      <CardContent className="py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-primary mb-2">
                Review Your Course Title
              </h2>
              <p className="text-sm sm:text-base text-secondary">
                We&apos;ve improved your course name. Feel free to edit or regenerate.
              </p>
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

          <div className="mb-4 p-3 bg-surface rounded-lg border">
            <p className="text-sm text-muted">Your original input:</p>
            <p className="text-secondary font-medium">{originalCourseName}</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                <Edit2 className="w-4 h-4 inline mr-1" />
                Course Title
              </label>
              <Input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Course title"
                className="font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                <Edit2 className="w-4 h-4 inline mr-1" />
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Course description"
                rows={4}
                className="w-full px-4 py-3 text-base border rounded-lg outline-none transition-all
                  bg-white dark:bg-dark-400
                  border-gray-300 dark:border-dark-border-input
                  text-gray-900 dark:text-dark-text
                  placeholder:text-gray-400 dark:placeholder:text-dark-text-muted
                  focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400
                  focus:border-transparent resize-none"
              />
              <p className="text-sm text-muted mt-1">
                This description will help guide the AI in generating relevant content.
              </p>
            </div>
          </div>
        </div>

        <WizardNavigation
          onBack={onBack}
          onNext={onNext}
          onCancel={onCancel}
          canGoBack={true}
          canGoNext={canProceed}
          isLoading={isLoading}
          nextLabel="Generate Personas"
        />
      </CardContent>
    </Card>
  );
}
