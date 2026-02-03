/**
 * useTeamKnowledge - Connect-Query hooks for Team Knowledge Source operations
 *
 * Provides hooks for:
 * - Uploading and queueing team knowledge files for async ingestion
 * - Subscribing to real-time ingestion status updates via SSE
 * - Listing and managing team knowledge sources
 * - Aggregated team knowledge for course wizard
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMutation, useQuery, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import { transport } from '@/lib/connect';

import {
  queueTeamKnowledgeIngestion,
  listTeamKnowledgeSources,
  deleteTeamKnowledgeSource,
  updateKnowledgeSourceIndex,
  getTeamKnowledgeSummary,
  getAggregatedTeamKnowledge,
} from '@/gen/mirai/v1/team_knowledge_service-TeamKnowledgeService_connectquery';

import {
  QueueTeamKnowledgeIngestionRequestSchema,
  ListTeamKnowledgeSourcesRequestSchema,
  DeleteTeamKnowledgeSourceRequestSchema,
  UpdateKnowledgeSourceIndexRequestSchema,
  GetTeamKnowledgeSummaryRequestSchema,
  GetAggregatedTeamKnowledgeRequestSchema,
  SubscribeIngestionStatusRequestSchema,
  TeamKnowledgeService,
  IngestionStatus,
  type SubscribeIngestionStatusResponse,
} from '@/gen/mirai/v1/team_knowledge_service_pb';

import type { KnowledgeSource, TopicWithExcerpts } from '@/gen/mirai/v1/knowledge_source_pb';

// =============================================================================
// Queue Team Knowledge Ingestion Hook
// =============================================================================

export interface QueueTeamKnowledgeIngestionParams {
  teamId: string;
  filename: string;
  contentType: string;
  fileContent: Uint8Array;
}

export interface QueueTeamKnowledgeIngestionResult {
  jobId: string;
  sourceId: string;
}

/**
 * Queue a file for async team knowledge ingestion.
 * Returns immediately with job_id for tracking via SSE stream.
 */
export function useQueueTeamKnowledgeIngestion() {
  const queryClient = useQueryClient();
  const mutation = useMutation(queueTeamKnowledgeIngestion);

  return {
    mutate: async (params: QueueTeamKnowledgeIngestionParams): Promise<QueueTeamKnowledgeIngestionResult> => {
      const request = create(QueueTeamKnowledgeIngestionRequestSchema, {
        teamId: params.teamId,
        filename: params.filename,
        contentType: params.contentType,
        fileContent: params.fileContent,
      });

      const result = await mutation.mutateAsync(request);

      // Invalidate team sources list to show the new pending source
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listTeamKnowledgeSources,
          cardinality: undefined,
        }),
      });

      return {
        jobId: result.jobId,
        sourceId: result.sourceId,
      };
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Ingestion Status Stream Hook (SSE)
// =============================================================================

export interface IngestionStatusEvent {
  jobId: string;
  sourceId: string;
  status: IngestionStatus;
  errorMessage?: string;
  source?: KnowledgeSource;
  progressPercent?: number;
}

/**
 * Subscribe to real-time ingestion status updates via SSE.
 * Handles automatic reconnection with exponential backoff.
 */
export function useIngestionStatusStream() {
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isConnectedRef = useRef(false);
  const [lastEvent, setLastEvent] = useState<IngestionStatusEvent | null>(null);

  const handleEvent = useCallback(
    (event: SubscribeIngestionStatusResponse) => {
      const status = event.status;

      // Ignore keepalive/unspecified events
      if (
        status === IngestionStatus.UNSPECIFIED ||
        status === IngestionStatus.KEEPALIVE
      ) {
        return;
      }

      // Track the last meaningful event for subscribers
      const statusEvent: IngestionStatusEvent = {
        jobId: event.jobId,
        sourceId: event.sourceId,
        status: status,
        errorMessage: event.errorMessage,
        source: event.source,
        progressPercent: event.progressPercent,
      };
      setLastEvent(statusEvent);

      // Invalidate queries based on status
      switch (status) {
        case IngestionStatus.QUEUED:
        case IngestionStatus.PROCESSING:
          // Invalidate to show processing state
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({
              schema: listTeamKnowledgeSources,
              cardinality: undefined,
            }),
          });
          break;

        case IngestionStatus.COMPLETED:
          // Invalidate all team knowledge queries on completion
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({
              schema: listTeamKnowledgeSources,
              cardinality: undefined,
            }),
          });
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({
              schema: getTeamKnowledgeSummary,
              cardinality: undefined,
            }),
          });
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({
              schema: getAggregatedTeamKnowledge,
              cardinality: undefined,
            }),
          });
          break;

        case IngestionStatus.FAILED:
          // Invalidate to show failed state
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({
              schema: listTeamKnowledgeSources,
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

    const client = createClient(TeamKnowledgeService, transport);
    abortControllerRef.current = new AbortController();

    try {
      isConnectedRef.current = true;
      reconnectAttemptRef.current = 0; // Reset on successful connection

      const request = create(SubscribeIngestionStatusRequestSchema, {});

      for await (const event of client.subscribeIngestionStatus(request, {
        signal: abortControllerRef.current.signal,
      })) {
        handleEvent(event);
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
        console.log('Ingestion stream: not authenticated, waiting for login');
        return;
      }

      console.error('Ingestion stream error:', err);
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

    console.log(`Reconnecting ingestion stream in ${delay}ms...`);

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

// =============================================================================
// List Team Knowledge Sources Hook
// =============================================================================

/**
 * List knowledge sources for a team.
 */
export function useListTeamKnowledgeSources(teamId: string | undefined) {
  const query = useQuery(
    listTeamKnowledgeSources,
    teamId ? { teamId } : undefined,
    { enabled: !!teamId }
  );

  return {
    data: query.data?.sources ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// =============================================================================
// Delete Team Knowledge Source Hook
// =============================================================================

/**
 * Delete a team knowledge source and its vectors.
 */
export function useDeleteTeamKnowledgeSource() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteTeamKnowledgeSource);

  return {
    mutate: async (id: string) => {
      const request = create(DeleteTeamKnowledgeSourceRequestSchema, { id });
      const result = await mutation.mutateAsync(request);

      // Invalidate team sources list and summary
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listTeamKnowledgeSources,
          cardinality: undefined,
        }),
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getTeamKnowledgeSummary,
          cardinality: undefined,
        }),
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getAggregatedTeamKnowledge,
          cardinality: undefined,
        }),
      });

      return { success: result.success };
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Update Knowledge Source Index Hook
// =============================================================================

export interface UpdateKnowledgeSourceIndexParams {
  sourceId: string;
  summary: string;
  topics: TopicWithExcerpts[];
  keyConcepts: string[];
}

/**
 * Save user edits to a knowledge source's summary, topics, and concepts.
 * Human-in-the-loop: allows users to refine AI-generated metadata.
 */
export function useUpdateKnowledgeSourceIndex() {
  const queryClient = useQueryClient();
  const mutation = useMutation(updateKnowledgeSourceIndex);

  return {
    mutate: async (params: UpdateKnowledgeSourceIndexParams) => {
      const request = create(UpdateKnowledgeSourceIndexRequestSchema, {
        sourceId: params.sourceId,
        summary: params.summary,
        topics: params.topics,
        keyConcepts: params.keyConcepts,
      });

      const result = await mutation.mutateAsync(request);

      // Invalidate team sources list and aggregated knowledge
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listTeamKnowledgeSources,
          cardinality: undefined,
        }),
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getAggregatedTeamKnowledge,
          cardinality: undefined,
        }),
      });

      return {
        source: result.source,
      };
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Team Knowledge Summary Hook
// =============================================================================

/**
 * Get aggregated statistics for team knowledge.
 */
export function useTeamKnowledgeSummary(teamId: string | undefined) {
  const query = useQuery(
    getTeamKnowledgeSummary,
    teamId ? { teamId } : undefined,
    { enabled: !!teamId }
  );

  return {
    totalSources: query.data?.totalSources ?? 0,
    totalChunks: query.data?.totalChunks ?? 0,
    totalTokens: query.data?.totalTokens ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// =============================================================================
// Aggregated Team Knowledge Hook
// =============================================================================

/**
 * Get combined summary of all team knowledge.
 * Used in course wizard when "Include team knowledge" is enabled.
 */
export function useAggregatedTeamKnowledge(teamId: string | undefined) {
  const query = useQuery(
    getAggregatedTeamKnowledge,
    teamId ? { teamId } : undefined,
    { enabled: !!teamId }
  );

  return {
    sources: query.data?.sources ?? [],
    mainTopics: query.data?.mainTopics ?? [],
    keyConcepts: query.data?.keyConcepts ?? [],
    stats: {
      totalSources: query.data?.totalSources ?? 0,
      totalChunks: query.data?.totalChunks ?? 0,
      totalTokens: query.data?.totalTokens ?? 0,
    },
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
