'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Clock, ArrowRight, X } from 'lucide-react';
import {
  GenerationJobStatus,
  type GenerationJob,
} from '@/gen/mirai/v1/ai_generation_types_pb';
import { useCancelJob } from '@/hooks/ai-generation/useJobs';

interface ActiveJobsListProps {
  jobs: GenerationJob[];
}

export function ActiveJobsList({ jobs }: ActiveJobsListProps) {
  const router = useRouter();
  const cancelJob = useCancelJob();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  if (jobs.length === 0) return null;

  const handleCancel = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this course creation?')) return;
    setCancellingId(jobId);
    try {
      await cancelJob.mutate(jobId);
    } catch {
      // Error handled by hook
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="mb-8">
      <h3 className="text-sm font-medium text-secondary mb-3">
        Active Course Creations ({jobs.length})
      </h3>
      <div className="flex flex-col gap-3">
        {jobs.map((job) => {
          const isAwaiting = job.status === GenerationJobStatus.AWAITING_APPROVAL;
          const isCancelling = cancellingId === job.id;

          return (
            <div
              key={job.id}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-4 sm:p-5 relative overflow-hidden"
            >
              {/* Decorative bg */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white" />
                <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-white" />
              </div>

              <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="bg-white/20 rounded-lg p-2.5 shrink-0">
                    {isAwaiting ? (
                      <Clock className="w-5 h-5 text-white" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-white truncate">
                      Course Creation
                    </h4>
                    <p className="text-white/80 text-xs mt-0.5 truncate">
                      {isAwaiting
                        ? 'Awaiting your review'
                        : job.progressMessage || 'AI is generating content...'}
                    </p>
                    <div className="mt-2 w-full max-w-xs">
                      <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full transition-all duration-500"
                          style={{ width: `${job.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-white/60 mt-1 inline-block">
                        {job.progressPercent}% complete
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => router.push(`/course/wizard?jobId=${job.id}`)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-600 rounded-lg font-medium text-sm hover:bg-white/90 transition-colors min-h-[44px]"
                  >
                    Resume
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleCancel(job.id)}
                    disabled={isCancelling}
                    className="flex items-center justify-center p-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors min-h-[44px] min-w-[44px] disabled:opacity-50"
                    title="Cancel"
                  >
                    {isCancelling ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
