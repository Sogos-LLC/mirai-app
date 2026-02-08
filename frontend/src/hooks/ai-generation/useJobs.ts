import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  getJob,
  listJobs,
  cancelJob,
} from '@/gen/mirai/v1/ai_generation_service-AIGenerationService_connectquery';
import {
  GenerationJobStatus,
  GenerationJobType,
  type GenerationJob,
} from '@/gen/mirai/v1/ai_generation_types_pb';
import {
  CancelJobRequestSchema,
} from '@/gen/mirai/v1/ai_generation_service_pb';
import { invalidateJobQueries } from './shared';

/**
 * Hook to get a generation job by ID.
 * Fetches a generation job by ID with optional polling.
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
      refetchInterval: options?.refetchInterval,
    }
  );

  return {
    data: query.data?.job,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

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
 * Hook to find the active COURSE_CREATION job for a specific course.
 * Used when resuming from the "Course Not Ready" editor page which only has courseId.
 */
export function useGetActiveJobForCourse(courseId: string | undefined) {
  const query = useQuery(
    listJobs,
    { courseId: courseId ?? '', type: GenerationJobType.COURSE_CREATION },
    { enabled: !!courseId },
  );

  const activeJob = (query.data?.jobs ?? []).find(
    (job: GenerationJob) =>
      !job.parentJobId &&
      (job.status === GenerationJobStatus.PROCESSING ||
        job.status === GenerationJobStatus.AWAITING_APPROVAL)
  );

  return {
    data: activeJob,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Hook to get active generation jobs (queued or processing).
 * Fetches a generation job by ID with optional polling.
 * Only shows top-level jobs (course_outline, full_course) - not individual lesson jobs.
 */
export function useActiveGenerationJobs() {
  const query = useQuery(listJobs, {});

  const activeJobs = (query.data?.jobs ?? []).filter(
    (job: GenerationJob) =>
      (job.status === GenerationJobStatus.QUEUED ||
       job.status === GenerationJobStatus.PROCESSING) &&
      !job.parentJobId
  );

  return {
    data: activeJobs,
    hasActiveJobs: activeJobs.length > 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
