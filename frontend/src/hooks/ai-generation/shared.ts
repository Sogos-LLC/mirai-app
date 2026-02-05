import { createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  listJobs,
  getJob,
} from '@/gen/mirai/v1/ai_generation_service-AIGenerationService_connectquery';
import {
  listNotifications,
  getUnreadCount,
} from '@/gen/mirai/v1/notification-NotificationService_connectquery';

/**
 * Helper to invalidate all job-related queries.
 * This ensures the UI updates after job mutations.
 */
export async function invalidateJobQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listJobs, cardinality: undefined }) }),
    queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getJob, cardinality: undefined }) }),
    queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listNotifications, cardinality: undefined }) }),
    queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getUnreadCount, cardinality: undefined }) }),
  ]);
}
