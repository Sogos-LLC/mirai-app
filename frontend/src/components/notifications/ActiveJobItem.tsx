'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { GenerationJob } from '@/gen/mirai/v1/ai_generation_pb';
import { GenerationJobType, GenerationJobStatus } from '@/gen/mirai/v1/ai_generation_pb';

interface ActiveJobItemProps {
  job: GenerationJob;
  onCancel?: (jobId: string) => Promise<void>;
}

const JOB_TYPE_LABELS: Record<number, string> = {
  [GenerationJobType.UNSPECIFIED]: 'Generation',
  [GenerationJobType.COURSE_OUTLINE]: 'Course Outline',
  [GenerationJobType.FULL_COURSE]: 'Full Course',
  [GenerationJobType.COMPONENT_REGEN]: 'Component',
  [GenerationJobType.SME_INGESTION]: 'SME Ingestion',
};

const STATUS_CONFIG: Record<number, { label: string; color: string; bgColor: string }> = {
  [GenerationJobStatus.QUEUED]: { label: 'Queued', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  [GenerationJobStatus.PROCESSING]: { label: 'Processing', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
};

export function ActiveJobItem({ job, onCancel }: ActiveJobItemProps) {
  const [cancelling, setCancelling] = useState(false);
  const typeLabel = JOB_TYPE_LABELS[job.type] || 'Generation';
  const statusConfig = STATUS_CONFIG[job.status] || STATUS_CONFIG[GenerationJobStatus.PROCESSING];

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onCancel || cancelling) return;

    if (confirm(`Cancel ${typeLabel.toLowerCase()} generation?`)) {
      setCancelling(true);
      try {
        await onCancel(job.id);
      } finally {
        setCancelling(false);
      }
    }
  };

  return (
    <div className="p-4 bg-indigo-50 border-b border-indigo-100">
      <div className="flex gap-3">
        {/* Spinner Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full ${statusConfig.bgColor} flex items-center justify-center`}>
          <Loader2 className={`w-5 h-5 ${statusConfig.color} animate-spin`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {typeLabel} Generation
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {statusConfig.label}
                {job.progressMessage && ` - ${job.progressMessage}`}
              </p>
            </div>

            {/* Cancel button */}
            {onCancel && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
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
      </div>
    </div>
  );
}
