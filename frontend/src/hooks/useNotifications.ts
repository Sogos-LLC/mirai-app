import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '@/gen/mirai/v1/notification-NotificationService_connectquery';
import {
  NotificationType,
  type Notification,
  MarkAsReadRequestSchema,
  MarkAllAsReadRequestSchema,
  DeleteNotificationRequestSchema,
} from '@/gen/mirai/v1/notification_pb';

// Re-export types and enums
export { NotificationType };
export type { Notification };

/**
 * Hook to list notifications with optional filters.
 */
export function useListNotifications(options?: {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
}) {
  const query = useQuery(listNotifications, {
    unreadOnly: options?.unreadOnly,
    limit: options?.limit ?? 50,
    cursor: options?.cursor,
  }, {
    // Poll at same interval as useUnreadCount to keep badge and list in sync
    refetchInterval: 30000,
  });

  return {
    data: query.data?.notifications ?? [],
    nextCursor: query.data?.nextCursor,
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get unread notification count.
 */
export function useUnreadCount() {
  const query = useQuery(getUnreadCount, {}, {
    // Refetch every 30 seconds for real-time updates
    refetchInterval: 30000,
  });

  return {
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to refetch all notification data.
 * Use this when opening the notification panel for immediate updates.
 */
export function useRefetchNotifications() {
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listNotifications, cardinality: undefined }),
      }),
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: getUnreadCount, cardinality: undefined }),
      }),
    ]);
  };
}

/**
 * Hook to mark notifications as read.
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const mutation = useMutation(markAsRead);

  return {
    mutate: async (notificationIds: string[]) => {
      const request = create(MarkAsReadRequestSchema, { notificationIds });
      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: listNotifications, cardinality: undefined }),
        }),
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: getUnreadCount, cardinality: undefined }),
        }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to mark all notifications as read.
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  const mutation = useMutation(markAllAsRead);

  return {
    mutate: async () => {
      const request = create(MarkAllAsReadRequestSchema, {});
      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: listNotifications, cardinality: undefined }),
        }),
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: getUnreadCount, cardinality: undefined }),
        }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to delete a notification.
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteNotification);

  return {
    mutate: async (notificationId: string) => {
      const request = create(DeleteNotificationRequestSchema, { notificationId });
      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: listNotifications, cardinality: undefined }),
        }),
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: getUnreadCount, cardinality: undefined }),
        }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
