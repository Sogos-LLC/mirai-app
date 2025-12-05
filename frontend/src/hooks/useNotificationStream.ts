import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '@/lib/connect';
import {
  NotificationService,
  NotificationEventType,
  SubscribeNotificationsRequestSchema,
} from '@/gen/mirai/v1/notification_pb';
import {
  listNotifications,
  getUnreadCount,
} from '@/gen/mirai/v1/notification-NotificationService_connectquery';
import { create } from '@bufbuild/protobuf';

/**
 * Hook that establishes a streaming connection for real-time notification updates.
 * Handles automatic reconnection with exponential backoff.
 */
export function useNotificationStream() {
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isConnectedRef = useRef(false);

  const handleEvent = useCallback(
    (eventType: NotificationEventType) => {
      // Ignore heartbeat/keep-alive events (UNSPECIFIED type)
      if (eventType === NotificationEventType.UNSPECIFIED) {
        return;
      }

      switch (eventType) {
        case NotificationEventType.CREATED:
          // Increment unread count optimistically
          queryClient.setQueryData(
            createConnectQueryKey({
              schema: getUnreadCount,
              cardinality: undefined,
            }),
            (old: { count?: number } | undefined) => ({
              count: (old?.count ?? 0) + 1,
            })
          );
          // Invalidate list so it refetches when panel opens
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({
              schema: listNotifications,
              cardinality: undefined,
            }),
          });
          break;

        case NotificationEventType.READ:
          // Decrement unread count
          queryClient.setQueryData(
            createConnectQueryKey({
              schema: getUnreadCount,
              cardinality: undefined,
            }),
            (old: { count?: number } | undefined) => ({
              count: Math.max((old?.count ?? 1) - 1, 0),
            })
          );
          // Invalidate list for UI update
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({
              schema: listNotifications,
              cardinality: undefined,
            }),
          });
          break;

        case NotificationEventType.DELETED:
          // Invalidate both queries
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({
              schema: listNotifications,
              cardinality: undefined,
            }),
          });
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({
              schema: getUnreadCount,
              cardinality: undefined,
            }),
          });
          break;
      }
    },
    [queryClient]
  );

  const subscribe = useCallback(async () => {
    // Cancel any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Abort any existing connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const client = createClient(NotificationService, transport);
    abortControllerRef.current = new AbortController();

    try {
      isConnectedRef.current = true;
      reconnectAttemptRef.current = 0; // Reset on successful connection

      const request = create(SubscribeNotificationsRequestSchema, {});

      for await (const event of client.subscribeNotifications(request, {
        signal: abortControllerRef.current.signal,
      })) {
        handleEvent(event.eventType);
      }

      // Stream ended normally (server closed it)
      isConnectedRef.current = false;
      scheduleReconnect();
    } catch (err) {
      isConnectedRef.current = false;

      // Don't reconnect if we intentionally aborted
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      console.error('Notification stream error:', err);
      scheduleReconnect();
    }
  }, [handleEvent]);

  const scheduleReconnect = useCallback(() => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttemptRef.current),
      30000
    );
    reconnectAttemptRef.current++;

    console.log(`Reconnecting notification stream in ${delay}ms...`);

    reconnectTimeoutRef.current = setTimeout(() => {
      subscribe();
    }, delay);
  }, [subscribe]);

  useEffect(() => {
    subscribe();

    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [subscribe]);
}
