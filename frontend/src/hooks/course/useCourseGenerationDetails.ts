import { useQuery } from '@connectrpc/connect-query';
import { getCourseGenerationDetails } from '@/gen/mirai/v1/ai_generation_service-AIGenerationService_connectquery';

export function useCourseGenerationDetails(courseId: string | null) {
  const query = useQuery(
    getCourseGenerationDetails,
    { courseId: courseId ?? '' },
    { enabled: !!courseId },
  );

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
