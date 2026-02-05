'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, Loader2, Clock } from 'lucide-react';
import {
  GenerationJobStatus,
  WorkflowStepType,
  type GenerationJob,
} from '@/gen/mirai/v1/ai_generation_types_pb';
import { getWorkflowStepLabel } from '@/machines/courseCreationMachine';

interface ActiveWorkflowCardProps {
  job: GenerationJob;
}

export function ActiveWorkflowCard({ job }: ActiveWorkflowCardProps) {
  const router = useRouter();

  const isAwaiting = job.status === GenerationJobStatus.AWAITING_APPROVAL;
  const stepLabel =
    isAwaiting && job.pendingStep != null
      ? getWorkflowStepLabel(job.pendingStep as WorkflowStepType)
      : null;

  return (
    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 mb-8 relative overflow-hidden">
      {/* Decorative bg pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -top-4 -right-4 w-32 h-32 rounded-full bg-white" />
        <div className="absolute -bottom-8 -left-8 w-48 h-48 rounded-full bg-white" />
      </div>

      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="bg-white/20 rounded-xl p-3 shrink-0">
            {isAwaiting ? (
              <Clock className="w-6 h-6 text-white" />
            ) : (
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              Course Creation in Progress
            </h3>
            <p className="text-white/80 text-sm mt-0.5">
              {isAwaiting
                ? stepLabel
                  ? `Awaiting your approval: ${stepLabel}`
                  : 'Awaiting your review'
                : job.progressMessage ?? 'AI is generating content...'}
            </p>
            {/* Progress bar */}
            <div className="mt-3 w-full max-w-xs">
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

        <button
          onClick={() => router.push('/course/wizard')}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-600 rounded-lg font-medium text-sm hover:bg-white/90 transition-colors min-h-[44px] shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          Resume
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default ActiveWorkflowCard;
