import { useQuery } from '@connectrpc/connect-query';
import { listJobs } from '@/gen/mirai/v1/ai_generation_service-AIGenerationService_connectquery';
import {
  GenerationJobType,
  GenerationJobStatus,
  type GenerationJob,
} from '@/gen/mirai/v1/ai_generation_types_pb';

/**
 * Hook to find an active COURSE_CREATION job for the current user.
 * Returns the first job that is PROCESSING or AWAITING_APPROVAL with no parentJobId.
 */
export function useActiveCourseCreation() {
  const { data, isLoading } = useQuery(listJobs, {
    type: GenerationJobType.COURSE_CREATION,
  });

  const activeJob: GenerationJob | null =
    data?.jobs?.find(
      (job) =>
        !job.parentJobId &&
        (job.status === GenerationJobStatus.PROCESSING ||
          job.status === GenerationJobStatus.AWAITING_APPROVAL)
    ) ?? null;

  return { activeJob, isLoading };
}
