import { useQuery } from '@connectrpc/connect-query';
import { listJobs } from '@/gen/mirai/v1/ai_generation_service-AIGenerationService_connectquery';
import {
  GenerationJobType,
  GenerationJobStatus,
  type GenerationJob,
} from '@/gen/mirai/v1/ai_generation_types_pb';

/**
 * Hook to find all active COURSE_CREATION jobs for the current user.
 * Returns jobs that are PROCESSING or AWAITING_APPROVAL with no parentJobId.
 */
export function useActiveCourseCreation() {
  const { data, isLoading } = useQuery(listJobs, {
    type: GenerationJobType.COURSE_CREATION,
  });

  const activeJobs: GenerationJob[] =
    data?.jobs?.filter(
      (job) =>
        !job.parentJobId &&
        (job.status === GenerationJobStatus.PROCESSING ||
          job.status === GenerationJobStatus.AWAITING_APPROVAL)
    ) ?? [];

  return { activeJobs, isLoading };
}
