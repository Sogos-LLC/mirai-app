'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { WorkflowStepType } from '@/gen/mirai/v1/ai_generation_types_pb';
import { useGraphVisualization } from '@/hooks/useCourseCreation';
import { getWorkflowStepLabel } from '@/machines/courseCreationMachine';

const MermaidDiagram = dynamic(() => import('@/components/ui/MermaidDiagram'), {
  ssr: false,
  loading: () => (
    <div className="h-64 flex items-center justify-center text-muted text-sm">
      Loading diagram...
    </div>
  ),
});

/**
 * Map a WorkflowStepType to the mermaid node ID for the approval node.
 * The static workflow mermaid uses single-letter IDs (A-R).
 */
function stepToMermaidNodeId(step: WorkflowStepType): string | undefined {
  switch (step) {
    case WorkflowStepType.INTENT_ANALYSIS:
      return 'B';
    case WorkflowStepType.DEFINE_SUCCESS:
      return 'D';
    case WorkflowStepType.APPROVE_STRUCTURE:
      return 'G';
    case WorkflowStepType.SAMPLE_LESSON:
      return 'I';
    case WorkflowStepType.FINAL_REVIEW:
      return 'M';
    default:
      return undefined;
  }
}

interface WorkflowVisualizationProps {
  jobId?: string | null;
  pendingStep?: WorkflowStepType | null;
  progressPercent?: number;
  progressMessage?: string;
  isActive?: boolean;
}

export function WorkflowVisualization({
  jobId,
  pendingStep,
  progressPercent = 0,
  progressMessage = '',
  isActive = false,
}: WorkflowVisualizationProps) {
  const { mermaidCode, isLoading } = useGraphVisualization(jobId ?? undefined);

  const highlightNodeId = pendingStep
    ? stepToMermaidNodeId(pendingStep)
    : undefined;

  const stepLabel = pendingStep ? getWorkflowStepLabel(pendingStep) : '';

  return (
    <div className="bg-surface border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-medium text-primary">Workflow Progress</h3>
      </div>

      {/* Progress bar — only when workflow is active */}
      {isActive && (
        <div className="px-4 pt-3">
          <div className="w-full h-1.5 bg-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 mb-3">
            <span className="text-xs text-secondary truncate mr-2">{progressMessage}</span>
            <span className="text-xs text-muted shrink-0">{progressPercent}%</span>
          </div>
        </div>
      )}

      {/* Current step label — only when awaiting approval */}
      {pendingStep && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-primary font-medium">
              Awaiting approval: {stepLabel}
            </span>
          </div>
        </div>
      )}

      {/* Mermaid diagram — always shown */}
      <div className="px-4 pb-4">
        {isLoading ? (
          <div className="h-48 flex items-center justify-center text-muted text-sm">
            Loading workflow diagram...
          </div>
        ) : mermaidCode ? (
          <MermaidDiagram
            code={mermaidCode}
            highlightNodeId={highlightNodeId}
            className="overflow-x-auto"
          />
        ) : null}
      </div>
    </div>
  );
}

export default WorkflowVisualization;
