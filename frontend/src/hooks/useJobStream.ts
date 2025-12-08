import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '@/lib/connect';
import {
  AIGenerationService,
  JobEventType,
  SubscribeJobsRequestSchema,
  type GenerationJob,
} from '@/gen/mirai/v1/ai_generation_pb';
import {
  listJobs,
  getJob,
  getCourseOutline,
  listGeneratedLessons,
  getGeneratedLesson,
} from '@/gen/mirai/v1/ai_generation-AIGenerationService_connectquery';
import {
  listNotifications,
  getUnreadCount,
} from '@/gen/mirai/v1/notification-NotificationService_connectquery';
import { create } from '@bufbuild/protobuf';

/**
 * Hook that establishes a streaming connection for real-time job events.
 * Handles automatic reconnection with exponential backoff.
 * Replaces polling for job status updates.
 */
export function useJobStream() {
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isConnectedRef = useRef(false);
  const [lastEvent, setLastEvent] = useState<{
    eventType: JobEventType;
    job: GenerationJob | undefined;
  } | null>(null);

  const handleEvent = useCallback(
    (eventType: JobEventType | string, job: GenerationJob | undefined) => {
      // Normalize event type - protojson may send as string or number
      const normalizedType = typeof eventType === 'string'
        ? JobEventType[eventType.replace('JOB_EVENT_TYPE_', '') as keyof typeof JobEventType]
        : eventType;

      // Ignore keepalive/unspecified events
      if (
        normalizedType === JobEventType.UNSPECIFIED ||
        normalizedType === JobEventType.KEEPALIVE
      ) {
        return;
      }

      // Track the last meaningful event for subscribers
      setLastEvent({ eventType: normalizedType, job });

      switch (normalizedType) {
        case JobEventType.CREATED:
        case JobEventType.UPDATED:
          // Invalidate job queries to show new/updated jobs
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({ schema: listJobs, cardinality: undefined }),
          });
          if (job?.id) {
            queryClient.invalidateQueries({
              queryKey: createConnectQueryKey({ schema: getJob, cardinality: undefined }),
            });
          }
          break;

        case JobEventType.COMPLETED:
          // Invalidate all related queries on completion
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({ schema: listJobs, cardinality: undefined }),
          });
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({ schema: getJob, cardinality: undefined }),
          });
          // Completion may generate new content - refresh these
          if (job?.courseId) {
            queryClient.invalidateQueries({
              queryKey: createConnectQueryKey({ schema: getCourseOutline, cardinality: undefined }),
            });
            queryClient.invalidateQueries({
              queryKey: createConnectQueryKey({ schema: listGeneratedLessons, cardinality: undefined }),
            });
          }
          if (job?.lessonId) {
            queryClient.invalidateQueries({
              queryKey: createConnectQueryKey({ schema: getGeneratedLesson, cardinality: undefined }),
            });
          }
          // Completion creates notifications
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({ schema: listNotifications, cardinality: undefined }),
          });
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({ schema: getUnreadCount, cardinality: undefined }),
          });
          break;

        case JobEventType.FAILED:
        case JobEventType.CANCELLED:
          // Invalidate job queries
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({ schema: listJobs, cardinality: undefined }),
          });
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({ schema: getJob, cardinality: undefined }),
          });
          // Failed jobs may create notifications
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({ schema: listNotifications, cardinality: undefined }),
          });
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({ schema: getUnreadCount, cardinality: undefined }),
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

    const client = createClient(AIGenerationService, transport);
    abortControllerRef.current = new AbortController();

    try {
      isConnectedRef.current = true;
      reconnectAttemptRef.current = 0; // Reset on successful connection

      const request = create(SubscribeJobsRequestSchema, {});

      for await (const event of client.subscribeJobs(request, {
        signal: abortControllerRef.current.signal,
      })) {
        handleEvent(event.eventType, event.job);
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

      // Don't retry on authentication errors - user needs to log in
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('unauthenticated') || errorMessage.includes('authentication required')) {
        console.log('Job stream: not authenticated, waiting for login');
        return;
      }

      console.error('Job stream error:', err);
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

    console.log(`Reconnecting job stream in ${delay}ms...`);

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

  return {
    lastEvent,
    isConnected: isConnectedRef.current,
  };
}
