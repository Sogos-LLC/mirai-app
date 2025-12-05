import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  generateCourseOutline,
  getCourseOutline,
  approveCourseOutline,
  rejectCourseOutline,
  updateCourseOutline,
  generateAllLessons,
  regenerateComponent,
  getJob,
  listJobs,
  cancelJob,
  getGeneratedLesson,
  listGeneratedLessons,
} from '@/gen/mirai/v1/ai_generation-AIGenerationService_connectquery';
import {
  listNotifications,
  getUnreadCount,
} from '@/gen/mirai/v1/notification-NotificationService_connectquery';
import {
  GenerationJobType,
  GenerationJobStatus,
  OutlineApprovalStatus,
  LessonComponentType,
  type GenerationJob,
  type CourseOutline,
  type OutlineSection,
  type OutlineLesson,
  type GeneratedLesson,
  type LessonComponent,
  type CourseGenerationInput,
  GenerateCourseOutlineRequestSchema,
  ApproveCourseOutlineRequestSchema,
  RejectCourseOutlineRequestSchema,
  UpdateCourseOutlineRequestSchema,
  GenerateAllLessonsRequestSchema,
  RegenerateComponentRequestSchema,
  CancelJobRequestSchema,
  CourseGenerationInputSchema,
} from '@/gen/mirai/v1/ai_generation_pb';

// Re-export types and enums
export {
  GenerationJobType,
  GenerationJobStatus,
  OutlineApprovalStatus,
  LessonComponentType,
};
export type {
  GenerationJob,
  CourseOutline,
  OutlineSection,
  OutlineLesson,
  GeneratedLesson,
  LessonComponent,
  CourseGenerationInput,
};

/**
 * Helper to invalidate all job-related queries.
 * This ensures the UI updates after job mutations.
 */
async function invalidateJobQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listJobs, cardinality: undefined }) }),
    queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getJob, cardinality: undefined }) }),
    // Also invalidate notifications since job completion creates notifications
    queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listNotifications, cardinality: undefined }) }),
    queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getUnreadCount, cardinality: undefined }) }),
  ]);
}

/**
 * Hook to generate a course outline.
 */
export function useGenerateCourseOutline() {
  const queryClient = useQueryClient();
  const mutation = useMutation(generateCourseOutline);

  return {
    mutate: async (input: {
      courseId: string;
      smeIds: string[];
      targetAudienceIds: string[];
      desiredOutcome: string;
      additionalContext?: string;
    }) => {
      const request = create(GenerateCourseOutlineRequestSchema, {
        input: create(CourseGenerationInputSchema, {
          courseId: input.courseId,
          smeIds: input.smeIds,
          targetAudienceIds: input.targetAudienceIds,
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

/**
 * Hook to get a course outline.
 */
export function useGetCourseOutline(courseId: string | undefined, version?: number) {
  const query = useQuery(
    getCourseOutline,
    courseId ? { courseId, version } : undefined,
    { enabled: !!courseId }
  );

  return {
    data: query.data?.outline,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to approve a course outline.
 */
export function useApproveCourseOutline() {
  const queryClient = useQueryClient();
  const mutation = useMutation(approveCourseOutline);

  return {
    mutate: async (courseId: string, outlineId: string) => {
      const request = create(ApproveCourseOutlineRequestSchema, {
        courseId,
        outlineId,
      });

      const result = await mutation.mutateAsync(request);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getCourseOutline, cardinality: undefined }) }),
        invalidateJobQueries(queryClient),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to reject a course outline.
 */
export function useRejectCourseOutline() {
  const queryClient = useQueryClient();
  const mutation = useMutation(rejectCourseOutline);

  return {
    mutate: async (courseId: string, outlineId: string, reason: string) => {
      const request = create(RejectCourseOutlineRequestSchema, {
        courseId,
        outlineId,
        reason,
      });

      const result = await mutation.mutateAsync(request);
      await queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getCourseOutline, cardinality: undefined }) });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to update a course outline.
 */
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

/**
 * Hook to generate all lessons for a course.
 */
export function useGenerateAllLessons() {
  const queryClient = useQueryClient();
  const mutation = useMutation(generateAllLessons);

  return {
    mutate: async (courseId: string) => {
      const request = create(GenerateAllLessonsRequestSchema, { courseId });

      const result = await mutation.mutateAsync(request);
      await invalidateJobQueries(queryClient);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to regenerate a component.
 */
export function useRegenerateComponent() {
  const queryClient = useQueryClient();
  const mutation = useMutation(regenerateComponent);

  return {
    mutate: async (data: {
      courseId: string;
      lessonId: string;
      componentId: string;
      modificationPrompt: string;
    }) => {
      const request = create(RegenerateComponentRequestSchema, {
        courseId: data.courseId,
        lessonId: data.lessonId,
        componentId: data.componentId,
        modificationPrompt: data.modificationPrompt,
      });

      const result = await mutation.mutateAsync(request);
      await Promise.all([
        invalidateJobQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getGeneratedLesson, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to get a generation job by ID.
 * @param jobId - The job ID to fetch
 * @param options - Optional configuration
 * @param options.enabled - Whether the query is enabled (default: true if jobId is provided)
 * @param options.refetchInterval - Override auto-polling interval. Set to false to disable auto-polling.
 */
export function useGetJob(
  jobId: string | undefined,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  const query = useQuery(
    getJob,
    jobId ? { jobId } : undefined,
    {
      enabled: options?.enabled ?? !!jobId,
      // Use provided refetchInterval, or default to auto-poll when job is in progress
      refetchInterval: options?.refetchInterval !== undefined
        ? options.refetchInterval
        : (data) => {
            // Default: poll every 2 seconds if job is in progress
            const job = data.state.data?.job;
            if (job?.status === GenerationJobStatus.QUEUED ||
                job?.status === GenerationJobStatus.PROCESSING) {
              return 2000;
            }
            return false;
          },
    }
  );

  return {
    data: query.data?.job,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to cancel a job.
 */
export function useCancelJob() {
  const queryClient = useQueryClient();
  const mutation = useMutation(cancelJob);

  return {
    mutate: async (jobId: string) => {
      const request = create(CancelJobRequestSchema, { jobId });
      const result = await mutation.mutateAsync(request);
      await invalidateJobQueries(queryClient);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to get a generated lesson.
 */
export function useGetGeneratedLesson(lessonId: string | undefined) {
  const query = useQuery(
    getGeneratedLesson,
    lessonId ? { lessonId } : undefined,
    { enabled: !!lessonId }
  );

  return {
    data: query.data?.lesson,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to list generated lessons for a course.
 */
export function useListGeneratedLessons(courseId: string | undefined) {
  const query = useQuery(
    listGeneratedLessons,
    courseId ? { courseId } : undefined,
    { enabled: !!courseId }
  );

  return {
    data: query.data?.lessons ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get active generation jobs (queued or processing).
 * Uses adaptive polling: 3 seconds when jobs are active, 30 seconds idle.
 * Only shows top-level jobs (course_outline, full_course) - not individual lesson jobs.
 */
export function useActiveGenerationJobs() {
  const query = useQuery(listJobs, {}, {
    // Adaptive polling: faster when jobs are active, slower when idle
    refetchInterval: (data) => {
      const jobs = data.state.data?.jobs ?? [];
      const hasActive = jobs.some(
        (job: GenerationJob) =>
          (job.status === GenerationJobStatus.QUEUED ||
           job.status === GenerationJobStatus.PROCESSING) &&
          !job.parentJobId // Only count top-level jobs
      );
      // Poll every 3 seconds when active, every 30 seconds when idle
      return hasActive ? 3000 : 30000;
    },
  });

  // Filter to only show top-level active jobs (not child lesson jobs)
  const activeJobs = (query.data?.jobs ?? []).filter(
    (job: GenerationJob) =>
      (job.status === GenerationJobStatus.QUEUED ||
       job.status === GenerationJobStatus.PROCESSING) &&
      !job.parentJobId // Exclude child jobs - only show parent/standalone jobs
  );

  return {
    data: activeJobs,
    hasActiveJobs: activeJobs.length > 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
