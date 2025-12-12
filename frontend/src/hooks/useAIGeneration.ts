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
  generateComponentImage,
  updateLessonComponents,
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
  GenerateComponentImageRequestSchema,
  UpdateLessonComponentsRequestSchema,
  LessonComponentSchema,
  ComponentAlignmentSchema,
  ComponentAlignmentTargetsSchema,
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

/**
 * Hook to get a course outline.
 * Also returns wizard data (SME personas, audience personas, tone) for realignment features.
 */
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
 * Supports optional alignment targets for realignment-based regeneration.
 */
export function useRegenerateComponent() {
  const queryClient = useQueryClient();
  const mutation = useMutation(regenerateComponent);

  return {
    mutate: async (data: {
      courseId: string;
      generatedLessonId: string;
      componentId: string;
      modificationPrompt: string;
      alignmentTargets?: {
        personaIds: string[];
        learningObjectiveIds: string[];
      };
    }) => {
      const request = create(RegenerateComponentRequestSchema, {
        courseId: data.courseId,
        generatedLessonId: data.generatedLessonId,
        componentId: data.componentId,
        modificationPrompt: data.modificationPrompt,
        alignmentTargets: data.alignmentTargets
          ? create(ComponentAlignmentTargetsSchema, {
              personaIds: data.alignmentTargets.personaIds,
              learningObjectiveIds: data.alignmentTargets.learningObjectiveIds,
            })
          : undefined,
      });

      const result = await mutation.mutateAsync(request);
      await Promise.all([
        invalidateJobQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getGeneratedLesson, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listGeneratedLessons, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to get a generation job by ID.
 * Relies on useJobStream() to invalidate queries via SSE events.
 *
 * @param jobId - The job ID to fetch
 * @param options - Optional configuration
 * @param options.enabled - Whether the query is enabled (default: true if jobId is provided)
 *
 * IMPORTANT: Ensure useJobStream() is called at a parent level (e.g., MainLayout)
 * to receive real-time job updates.
 */
export function useGetJob(
  jobId: string | undefined,
  options?: { enabled?: boolean }
) {
  const query = useQuery(
    getJob,
    jobId ? { jobId } : undefined,
    {
      enabled: options?.enabled ?? !!jobId,
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
 * Relies on useJobStream() to invalidate queries via SSE events.
 * Only shows top-level jobs (course_outline, full_course) - not individual lesson jobs.
 *
 * IMPORTANT: Ensure useJobStream() is called at a parent level (e.g., MainLayout)
 * to receive real-time job updates. Without the stream, this hook only fetches on mount.
 */
export function useActiveGenerationJobs() {
  const query = useQuery(listJobs, {});

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

/**
 * Hook to generate an image for an image component.
 * This is a synchronous operation (no job polling needed).
 */
export function useGenerateComponentImage() {
  const queryClient = useQueryClient();
  const mutation = useMutation(generateComponentImage);

  return {
    mutate: async (data: {
      courseId: string;
      generatedLessonId: string;
      componentId: string;
      prompt: string;
      aspectRatio?: string;
    }) => {
      const request = create(GenerateComponentImageRequestSchema, {
        courseId: data.courseId,
        generatedLessonId: data.generatedLessonId,
        componentId: data.componentId,
        prompt: data.prompt,
        aspectRatio: data.aspectRatio,
      });

      const result = await mutation.mutateAsync(request);
      // Invalidate lesson data to refresh the component
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: getGeneratedLesson, cardinality: undefined }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Hook to update lesson components (manual edits).
 * Used by the course editor to save component changes.
 */
export function useUpdateLessonComponents() {
  const queryClient = useQueryClient();
  const mutation = useMutation(updateLessonComponents);

  return {
    mutate: async (data: {
      courseId: string;
      generatedLessonId: string;
      components: Array<{
        id: string;
        type: LessonComponentType;
        order: number;
        contentJson: string;
        alignment?: {
          learningObjectiveIds?: string[];
        };
      }>;
    }) => {
      // Convert components to proto schema
      const protoComponents = data.components.map((c) =>
        create(LessonComponentSchema, {
          id: c.id,
          type: c.type,
          order: c.order,
          contentJson: c.contentJson,
          alignment: c.alignment
            ? create(ComponentAlignmentSchema, {
                learningObjectiveIds: c.alignment.learningObjectiveIds ?? [],
              })
            : undefined,
        })
      );

      const request = create(UpdateLessonComponentsRequestSchema, {
        courseId: data.courseId,
        generatedLessonId: data.generatedLessonId,
        components: protoComponents,
      });

      const result = await mutation.mutateAsync(request);
      // Invalidate lesson data to refresh with saved changes
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: getGeneratedLesson, cardinality: undefined }),
        }),
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: listGeneratedLessons, cardinality: undefined }),
        }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
