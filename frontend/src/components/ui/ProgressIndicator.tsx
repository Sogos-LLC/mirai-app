import React from 'react';

interface ProgressIndicatorProps {
  steps: number;
  currentStep: number;
}

export default function ProgressIndicator({ steps, currentStep }: ProgressIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: steps }).map((_, index) => (
        <div
          key={index}
          className={`h-2 w-8 rounded-full transition-colors ${
            index < currentStep
              ? 'bg-primary-600'
              : index === currentStep
              ? 'bg-primary-400'
              : 'bg-gray-300'
          }`}
        />
      ))}
    </div>
  );
}
