'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import WizardNavigation from '../WizardNavigation';

interface CourseNameStepProps {
  courseName: string;
  onCourseNameChange: (name: string) => void;
  onNext: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function CourseNameStep({
  courseName,
  onCourseNameChange,
  onNext,
  onCancel,
  isLoading = false,
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

          <h2 className="text-2xl font-bold text-primary mb-2">
            What would you like to teach?
          </h2>
          <p className="text-secondary mb-8">
            Enter a course name or topic. Our AI will help you refine it and generate
            engaging content.
          </p>

          <form onSubmit={handleSubmit}>
            <Input
              type="text"
              placeholder="e.g., Introduction to Machine Learning, Leadership Skills for Managers"
              value={courseName}
              onChange={(e) => onCourseNameChange(e.target.value)}
              className="text-lg"
              autoFocus
            />
            <p className="text-sm text-muted mt-2">
              Don&apos;t worry about getting it perfect - you can refine it in the next step.
            </p>
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
