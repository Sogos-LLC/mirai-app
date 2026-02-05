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
  type GenerationJob,
} from '@/gen/mirai/v1/ai_generation_types_pb';
import {
  CancelJobRequestSchema,
} from '@/gen/mirai/v1/ai_generation_service_pb';
import { invalidateJobQueries } from './shared';

/**
 * Hook to get a generation job by ID.
 * Relies on useJobStream() to invalidate queries via SSE events.
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
 * Hook to get active generation jobs (queued or processing).
 * Relies on useJobStream() to invalidate queries via SSE events.
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
