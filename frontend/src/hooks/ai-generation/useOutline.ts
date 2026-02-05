import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  generateCourseOutline,
  getCourseOutline,
  updateCourseOutline,
} from '@/gen/mirai/v1/ai_generation_service-AIGenerationService_connectquery';
import {
  type OutlineSection,
  CourseGenerationInputSchema,
} from '@/gen/mirai/v1/ai_generation_types_pb';
import {
  GenerateCourseOutlineRequestSchema,
  UpdateCourseOutlineRequestSchema,
} from '@/gen/mirai/v1/ai_generation_service_pb';
import { invalidateJobQueries } from './shared';

export function useGenerateCourseOutline() {
  const queryClient = useQueryClient();
  const mutation = useMutation(generateCourseOutline);

  return {
    mutate: async (input: {
      courseId: string;
      desiredOutcome: string;
      additionalContext?: string;
    }) => {
      const request = create(GenerateCourseOutlineRequestSchema, {
        input: create(CourseGenerationInputSchema, {
          courseId: input.courseId,
          desiredOutcome: input.desiredOutcome,
          additionalContext: input.additionalContext,
        }),
      });

      const result = await mutation.mutateAsync(request);
      await invalidateJobQueries(queryClient);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useGetCourseOutline(courseId: string | undefined, version?: number) {
  const query = useQuery(
    getCourseOutline,
    courseId ? { courseId, version } : undefined,
    { enabled: !!courseId }
  );

  return {
    data: query.data?.outline,
    wizardData: query.data?.wizardData,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useUpdateCourseOutline() {
  const queryClient = useQueryClient();
  const mutation = useMutation(updateCourseOutline);

  return {
    mutate: async (courseId: string, outlineId: string, sections: OutlineSection[]) => {
      const request = create(UpdateCourseOutlineRequestSchema, {
        courseId,
        outlineId,
        sections,
      });

      const result = await mutation.mutateAsync(request);
      await queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getCourseOutline, cardinality: undefined }) });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
