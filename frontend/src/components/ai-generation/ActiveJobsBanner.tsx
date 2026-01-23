'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { GenerationJob } from '@/gen/mirai/v1/ai_generation_types_pb';
import { GenerationJobType, GenerationJobStatus } from '@/gen/mirai/v1/ai_generation_types_pb';

interface ActiveJobsBannerProps {
  jobs: GenerationJob[];
  onViewProgress?: (job: GenerationJob) => void;
  onCancel?: (jobId: string) => Promise<void>;
}

function getStatusLabel(status: GenerationJobStatus): string {
  switch (status) {
    case GenerationJobStatus.QUEUED:
      return 'Queued';
    case GenerationJobStatus.PROCESSING:
      return 'Generating';
    default:
      return 'In Progress';
  }
}

export function ActiveJobsBanner({ jobs, onViewProgress, onCancel }: ActiveJobsBannerProps) {
  const [cancelling, setCancelling] = useState(false);

  if (jobs.length === 0) return null;

  // Find the most relevant job to show (prefer FULL_COURSE or COURSE_OUTLINE)
  const primaryJob = jobs.find(j => j.type === GenerationJobType.FULL_COURSE)
    || jobs.find(j => j.type === GenerationJobType.COURSE_OUTLINE)
    || jobs[0];

  const handleCancel = async () => {
    if (!onCancel || cancelling) return;

    if (confirm('Are you sure you want to cancel this generation?')) {
      setCancelling(true);
      try {
        await onCancel(primaryJob.id);
      } finally {
        setCancelling(false);
      }
    }
  };

  return (
    <div
      className="bg-indigo-600 rounded-lg px-4 py-3 mb-6 shadow-md cursor-pointer hover:bg-indigo-700 transition-colors"
      onClick={() => onViewProgress?.(primaryJob)}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Loader2 className="w-5 h-5 text-white animate-spin flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-white font-medium text-sm truncate">
                {primaryJob.progressMessage || `${getStatusLabel(primaryJob.status)}...`}
              </span>
              <span className="text-white/70 text-sm flex-shrink-0">
                {primaryJob.progressPercent || 0}%
              </span>
            </div>
          </div>
        </div>

        {onCancel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCancel();
            }}
            disabled={cancelling}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors flex-shrink-0"
            title="Cancel generation"
          >
            {cancelling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <X className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
