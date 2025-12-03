'use client';

import { useEffect, useState } from 'react';
import type { GenerationJob, GenerationJobStatus } from '@/gen/mirai/v1/ai_generation_pb';
import { getStepLabel, type CourseGenerationContext } from '@/machines/courseGenerationMachine';

// Job status constants from proto
const JOB_STATUS = {
  UNSPECIFIED: 0,
  QUEUED: 1,
  PROCESSING: 2,
  COMPLETED: 3,
  FAILED: 4,
  CANCELLED: 5,
} as const;

interface GenerationProgressPanelProps {
  currentStep: CourseGenerationContext['currentStep'];
  progressPercent: number;
  progressMessage: string;
  job?: GenerationJob | null;
  onCancel?: () => void;
  onContinueInBackground?: () => void;
  error?: { message: string } | null;
  onRetry?: () => void;
}

const STEP_DEFINITIONS = [
  { key: 'configure', label: 'Configure', icon: '1' },
  { key: 'generating-outline', label: 'Generate Outline', icon: '2' },
  { key: 'review-outline', label: 'Review', icon: '3' },
  { key: 'generating-lessons', label: 'Generate Content', icon: '4' },
  { key: 'complete', label: 'Complete', icon: '5' },
];

export function GenerationProgressPanel({
  currentStep,
  progressPercent,
  progressMessage,
  job,
  onCancel,
  onContinueInBackground,
  error,
  onRetry,
}: GenerationProgressPanelProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Track elapsed time during generation
  useEffect(() => {
    if (currentStep === 'generating-outline' || currentStep === 'generating-lessons') {
      const interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedTime(0);
    }
  }, [currentStep]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status?: GenerationJobStatus): string => {
    if (!status) return 'bg-gray-400';
    switch (status) {
      case JOB_STATUS.QUEUED:
        return 'bg-yellow-500';
      case JOB_STATUS.PROCESSING:
        return 'bg-blue-500';
      case JOB_STATUS.COMPLETED:
        return 'bg-green-500';
      case JOB_STATUS.FAILED:
        return 'bg-red-500';
      case JOB_STATUS.CANCELLED:
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusLabel = (status?: GenerationJobStatus): string => {
    if (!status) return 'Unknown';
    switch (status) {
      case JOB_STATUS.QUEUED:
        return 'Queued';
      case JOB_STATUS.PROCESSING:
        return 'Processing';
      case JOB_STATUS.COMPLETED:
        return 'Completed';
      case JOB_STATUS.FAILED:
        return 'Failed';
      case JOB_STATUS.CANCELLED:
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const isGenerating = currentStep === 'generating-outline' || currentStep === 'generating-lessons';
  const currentStepIndex = STEP_DEFINITIONS.findIndex((s) => s.key === currentStep);

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Course Generation</h2>
            <p className="text-indigo-100 text-sm mt-1">{getStepLabel(currentStep)}</p>
          </div>
          {isGenerating && (
            <div className="text-right">
              <div className="text-2xl font-mono text-white">{formatTime(elapsedTime)}</div>
              <div className="text-xs text-indigo-200">Elapsed</div>
            </div>
          )}
        </div>
      </div>

      {/* Step Indicators */}
      <div className="px-6 py-4 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          {STEP_DEFINITIONS.map((step, index) => {
            const isActive = step.key === currentStep;
            const isComplete = index < currentStepIndex;
            const isFuture = index > currentStepIndex;

            return (
              <div key={step.key} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all
                      ${isComplete ? 'bg-green-500 text-white' : ''}
                      ${isActive ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 animate-pulse' : ''}
                      ${isFuture ? 'bg-gray-200 text-gray-400' : ''}
                    `}
                  >
                    {isComplete ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      step.icon
                    )}
                  </div>
                  <span className={`mt-1 text-xs ${isActive ? 'text-indigo-600 font-medium' : 'text-gray-500'}`}>
                    {step.label}
                  </span>
                </div>
                {index < STEP_DEFINITIONS.length - 1 && (
                  <div
                    className={`w-8 h-0.5 mx-1 transition-all ${isComplete ? 'bg-green-500' : 'bg-gray-200'}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Progress Content */}
      <div className="p-6">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-red-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="ml-3 flex-1">
                <h4 className="text-sm font-medium text-red-800">Generation Failed</h4>
                <p className="mt-1 text-sm text-red-700">{error.message}</p>
              </div>
            </div>
            {onRetry && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={onRetry}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        ) : isGenerating ? (
          <div className="space-y-6">
            {/* Simple Spinner with Status */}
            <div className="flex flex-col items-center py-8">
              <div className="relative mb-6">
                {/* Outer ring */}
                <div className="w-20 h-20 rounded-full border-4 border-indigo-100" />
                {/* Spinning indicator */}
                <div className="absolute inset-0">
                  <div className="w-20 h-20 border-4 border-transparent border-t-indigo-600 rounded-full animate-spin" />
                </div>
                {/* Progress percentage in center */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-semibold text-indigo-600">{Math.round(progressPercent)}%</span>
                </div>
              </div>

              {/* Status Message */}
              <div className="text-center">
                <p className="text-lg font-medium text-gray-900">
                  {progressMessage || (currentStep === 'generating-outline' ? 'Generating Outline...' : 'Generating Content...')}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  {currentStep === 'generating-outline'
                    ? 'AI is analyzing your SME knowledge and creating a course structure'
                    : 'AI is generating detailed lesson content based on the approved outline'}
                </p>
              </div>
            </div>

            {/* Minimal Progress Bar */}
            <div className="px-4">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Compact Job Details (only show if retry) */}
            {job && job.retryCount > 0 && (
              <div className="flex justify-center">
                <span className="text-xs text-gray-400">
                  Retry attempt {job.retryCount} of {job.maxRetries}
                </span>
              </div>
            )}
          </div>
        ) : currentStep === 'complete' ? (
          <div className="text-center py-8">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900">Generation Complete!</h3>
            <p className="mt-2 text-sm text-gray-500">
              Your course content has been generated and is ready for review.
            </p>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            Waiting for generation to start...
          </div>
        )}
      </div>

      {/* Footer */}
      {isGenerating && (onCancel || onContinueInBackground) && (
        <div className="px-6 py-4 bg-gray-50 border-t">
          {/* Helpful message */}
          <p className="text-xs text-gray-500 mb-3 text-center">
            You can continue in the background and we'll notify you when complete.
          </p>
          <div className="flex justify-between items-center gap-3">
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel Generation
              </button>
            )}
            {onContinueInBackground && (
              <button
                onClick={onContinueInBackground}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Continue in Background
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
