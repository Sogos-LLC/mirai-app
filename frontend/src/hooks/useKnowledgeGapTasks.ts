/**
 * useKnowledgeGapTasks - Connect-Query hooks for KnowledgeGapService
 *
 * Provides hooks for:
 * - Creating gap tasks from Step 1 analysis
 * - Listing gap tasks for the current user (dashboard)
 * - Listing gap tasks for a course (assigner view)
 * - Completing a gap task after knowledge upload
 */

import { useMutation, useQuery, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';

import {
  createGapTasks,
  listGapTasksForUser,
  listGapTasksForCourse,
  completeGapTask,
} from '@/gen/mirai/v1/knowledge_gap-KnowledgeGapService_connectquery';

import {
  CreateGapTasksRequestSchema,
  CompleteGapTaskRequestSchema,
  type GapTaskInput,
  GapTaskInputSchema,
} from '@/gen/mirai/v1/knowledge_gap_pb';

import { type KnowledgeGapTaskStatus } from '@/gen/mirai/v1/knowledge_gap_pb';

// =============================================================================
// Create Gap Tasks (bulk)
// =============================================================================

export function useCreateGapTasks() {
  const queryClient = useQueryClient();
  const mutation = useMutation(createGapTasks);

  return {
    mutate: async (params: {
      courseId: string;
      targetTeamId: string;
      tasks: Array<{ gapDescription: string; assignedToUserId: string }>;
    }) => {
      const taskInputs: GapTaskInput[] = params.tasks.map((t) =>
        create(GapTaskInputSchema, {
          gapDescription: t.gapDescription,
          assignedToUserId: t.assignedToUserId,
        })
      );

      const request = create(CreateGapTasksRequestSchema, {
        courseId: params.courseId,
        targetTeamId: params.targetTeamId,
        tasks: taskInputs,
      });

      const result = await mutation.mutateAsync(request);

      void queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listGapTasksForCourse, cardinality: undefined }),
      });

      return result;
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// List Gap Tasks for Current User (dashboard)
// =============================================================================

export function useListGapTasksForUser(status?: KnowledgeGapTaskStatus) {
  const query = useQuery(listGapTasksForUser, { status });

  return {
    data: query.data?.tasks ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// =============================================================================
// List Gap Tasks for Course (assigner view)
// =============================================================================

export function useListGapTasksForCourse(courseId: string) {
  const query = useQuery(
    listGapTasksForCourse,
    { courseId },
    { enabled: !!courseId },
  );

  return {
    data: query.data?.tasks ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// =============================================================================
// Complete Gap Task
// =============================================================================

export function useCompleteGapTask() {
  const queryClient = useQueryClient();
  const mutation = useMutation(completeGapTask);

  return {
    mutate: async (params: { taskId: string; knowledgeSourceId?: string; completionNotes?: string }) => {
      const request = create(CompleteGapTaskRequestSchema, {
        taskId: params.taskId,
        knowledgeSourceId: params.knowledgeSourceId,
        completionNotes: params.completionNotes,
      });

      const result = await mutation.mutateAsync(request);

      void queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listGapTasksForUser, cardinality: undefined }),
      });
      void queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listGapTasksForCourse, cardinality: undefined }),
      });

      return result;
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
