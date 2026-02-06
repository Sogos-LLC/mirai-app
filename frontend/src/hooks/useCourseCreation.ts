/**
 * useCourseCreation - Connect-Query hooks for the unified Course Creation Workflow
 *
 * Provides hooks for:
 * - Starting the unified course creation workflow (Python Temporal)
 * - Approving/rejecting workflow steps (signals to paused workflow)
 * - Fetching graph visualization (mermaid diagram)
 */

import { useMutation, useQuery, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';

import {
  startCourseCreation,
  approveWorkflowStep,
  rejectWorkflowStep,
  getGraphVisualization,
  getWorkflowState,
  listJobs,
  getJob,
} from '@/gen/mirai/v1/ai_generation_service-AIGenerationService_connectquery';

import {
  StartCourseCreationRequestSchema,
  ApproveWorkflowStepRequestSchema,
  RejectWorkflowStepRequestSchema,
  GetGraphVisualizationRequestSchema,
} from '@/gen/mirai/v1/ai_generation_service_pb';

import { type WorkflowStepType } from '@/gen/mirai/v1/ai_generation_types_pb';

// =============================================================================
// Start Course Creation Workflow
// =============================================================================

/**
 * Start the unified course creation workflow.
 * This replaces the old wizard → outline → lesson pipeline with a single
 * Python Temporal workflow that handles everything.
 */
export function useStartCourseCreation() {
  const queryClient = useQueryClient();
  const mutation = useMutation(startCourseCreation);

  return {
    mutate: async (params: {
      courseId: string;
      topic: string;
      audience: string;
      useContext?: string;
      internalDataOnly?: boolean;
      selectedTeamDocIds?: string[];
      selectedGlobalDocIds?: string[];
    }) => {
      const request = create(StartCourseCreationRequestSchema, {
        courseId: params.courseId,
        topic: params.topic,
        audience: params.audience,
        useContext: params.useContext,
        internalDataOnly: params.internalDataOnly ?? false,
        selectedTeamDocIds: params.selectedTeamDocIds ?? [],
        selectedGlobalDocIds: params.selectedGlobalDocIds ?? [],
      });

      const result = await mutation.mutateAsync(request);

      // Invalidate job queries so the new job appears
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listJobs, cardinality: undefined }),
      });

      return result;
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Approve Workflow Step
// =============================================================================

/**
 * Send approval signal to a paused course creation workflow.
 * The workflow will continue to the next step.
 */
export function useApproveWorkflowStep() {
  const queryClient = useQueryClient();
  const mutation = useMutation(approveWorkflowStep);

  return {
    mutate: async (params: {
      jobId: string;
      step: WorkflowStepType;
      selectedIds?: string[];
      modifications?: Record<string, string>;
    }) => {
      const request = create(ApproveWorkflowStepRequestSchema, {
        jobId: params.jobId,
        step: params.step,
        selectedIds: params.selectedIds ?? [],
        modifications: params.modifications ?? {},
      });

      const result = await mutation.mutateAsync(request);

      // Invalidate job query to reflect the approval
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: getJob, cardinality: undefined }),
      });

      return result;
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Reject Workflow Step
// =============================================================================

/**
 * Send rejection signal to a paused course creation workflow.
 * The workflow will regenerate the current step.
 */
export function useRejectWorkflowStep() {
  const queryClient = useQueryClient();
  const mutation = useMutation(rejectWorkflowStep);

  return {
    mutate: async (params: {
      jobId: string;
      step: WorkflowStepType;
      feedback: string;
    }) => {
      const request = create(RejectWorkflowStepRequestSchema, {
        jobId: params.jobId,
        step: params.step,
        feedback: params.feedback,
      });

      const result = await mutation.mutateAsync(request);

      // Invalidate job query to reflect the rejection
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: getJob, cardinality: undefined }),
      });

      return result;
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Graph Visualization
// =============================================================================

/**
 * Fetch the mermaid diagram for the course creation graph.
 * The workflow diagram is static, so this works with or without a jobId.
 */
export function useGraphVisualization(jobId?: string) {
  const query = useQuery(
    getGraphVisualization,
    { jobId: jobId ?? '' },
  );

  return {
    mermaidCode: query.data?.mermaidCode ?? '',
    currentNode: query.data?.currentNode ?? '',
    isLoading: query.isLoading,
    error: query.error,
  };
}

// =============================================================================
// Workflow State Polling
// =============================================================================

/**
 * Poll the Temporal workflow for its current state.
 * Replaces SSE streaming with 2s interval polling via Temporal queries.
 * Stops polling when the workflow is completed or failed.
 */
export function useWorkflowState(jobId: string | null, enabled: boolean) {
  const query = useQuery(
    getWorkflowState,
    { jobId: jobId ?? '' },
    {
      enabled: enabled && !!jobId,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === 'completed' || status === 'failed') return false;
        return 2000;
      },
    },
  );

  return {
    state: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
