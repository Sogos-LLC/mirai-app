import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  getCoursePlan,
  approveCoursePlan,
} from '@/gen/mirai/v1/ai_generation_service-AIGenerationService_connectquery';
import {
  GetCoursePlanRequestSchema,
  ApproveCoursePlanRequestSchema,
} from '@/gen/mirai/v1/ai_generation_service_pb';
import type {
  CoursePlan,
  DocumentAnalysis,
  PlannedSection,
  PlannedLesson,
} from '@/gen/mirai/v1/ai_generation_types_pb';

export type { CoursePlan, DocumentAnalysis, PlannedSection, PlannedLesson };

/**
 * Hook to get a course plan.
 */
export function useGetCoursePlan(courseId: string | undefined) {
  const query = useQuery(
    getCoursePlan,
    courseId ? { courseId } : undefined,
    { enabled: !!courseId }
  );

  return {
    data: query.data?.plan,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to approve a course plan.
 */
export function useApproveCoursePlan() {
  const queryClient = useQueryClient();
  const mutation = useMutation(approveCoursePlan);

  return {
    mutate: async (courseId: string) => {
      const request = create(ApproveCoursePlanRequestSchema, { courseId });
      const result = await mutation.mutateAsync(request);
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: getCoursePlan, cardinality: undefined }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
