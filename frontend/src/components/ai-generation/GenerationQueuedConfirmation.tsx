'use client';

import { Clock, Eye, ArrowRight, CheckCircle2 } from 'lucide-react';

interface GenerationQueuedConfirmationProps {
  jobId: string;
  onWaitForCompletion: () => void;
  onNavigateAway: () => void;
  // Optional customization props
  title?: string;
  description?: string;
  infoTitle?: string;
  infoDescription?: string;
  waitButtonLabel?: string;
  navigateButtonLabel?: string;
  // Legacy props for lesson generation
  totalLessons?: number;
  courseTitle?: string;
}

export function GenerationQueuedConfirmation({
  jobId,
  onWaitForCompletion,
  onNavigateAway,
  title = 'Generation Started!',
  description,
  infoTitle = 'Generation takes a few minutes',
  infoDescription = 'You can wait here to watch the progress, or continue working and receive a notification when complete.',
  waitButtonLabel = 'Watch Progress',
  navigateButtonLabel = "I'll Come Back Later",
  totalLessons,
  courseTitle,
}: GenerationQueuedConfirmationProps) {
  // Build default description if not provided
  const displayDescription = description ?? (
    courseTitle
      ? `${courseTitle} has been queued for generation.${totalLessons ? ` ${totalLessons} lessons will be created using AI.` : ''}`
      : `Your content has been queued for generation.${totalLessons ? ` ${totalLessons} lessons will be created using AI.` : ''}`
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      {/* Success Icon */}
      <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
        <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-primary mb-2 text-center">
        {title}
      </h2>

      {/* Description */}
      <p className="text-secondary text-center mb-8 max-w-md">
        {displayDescription}
      </p>

      {/* Info Box */}
      <div className="w-full max-w-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium mb-1">{infoTitle}</p>
            <p className="text-blue-700 dark:text-blue-300">
              {infoDescription}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
        <button
          onClick={onWaitForCompletion}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Eye className="w-5 h-5" />
          {waitButtonLabel}
        </button>
        <button
          onClick={onNavigateAway}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-surface text-primary font-medium rounded-lg border hover:bg-hover transition-colors"
        >
          {navigateButtonLabel}
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* Job ID for reference */}
      <p className="text-xs text-muted mt-6">
        Job ID: <code className="bg-hover px-1 py-0.5 rounded">{jobId}</code>
      </p>
    </div>
  );
}
