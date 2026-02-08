import { useQuery } from '@connectrpc/connect-query';
import { listJobs } from '@/gen/mirai/v1/ai_generation_service-AIGenerationService_connectquery';
import {
  GenerationJobType,
  GenerationJobStatus,
  type GenerationJob,
} from '@/gen/mirai/v1/ai_generation_types_pb';

/**
 * Hook to find all in-progress COURSE_CREATION jobs for the current user.
 * Returns jobs that are PROCESSING, AWAITING_APPROVAL, or DEFERRED with no parentJobId.
 * Also includes CANCELLED jobs (for delete cleanup).
 */
export function useInProgressJobs() {
  const { data, isLoading } = useQuery(listJobs, {
    type: GenerationJobType.COURSE_CREATION,
  });

  const inProgressJobs: GenerationJob[] =
    data?.jobs?.filter(
      (job) =>
        !job.parentJobId &&
        (job.status === GenerationJobStatus.PROCESSING ||
          job.status === GenerationJobStatus.AWAITING_APPROVAL ||
          job.status === GenerationJobStatus.DEFERRED ||
          job.status === GenerationJobStatus.CANCELLED)
    ) ?? [];

  return { inProgressJobs, inProgressCount: inProgressJobs.length, isLoading };
}
