/**
 * useKnowledgeSources - Connect-Query hooks for Knowledge Source operations
 *
 * Provides hooks for:
 * - Uploading and processing files for RAG (wizard flow)
 * - Listing knowledge sources by session or course
 * - Linking session sources to a course
 * - Searching knowledge for RAG
 */

import { useMutation, useQuery, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';

import {
  uploadAndProcess,
  listKnowledgeSourcesBySession,
  linkSessionToCourse,
  listKnowledgeSources,
  deleteKnowledgeSource,
  searchKnowledgeBySession,
} from '@/gen/mirai/v1/knowledge_service-KnowledgeSourceService_connectquery';

import {
  UploadAndProcessRequestSchema,
  ListKnowledgeSourcesBySessionRequestSchema,
  LinkSessionToCourseRequestSchema,
  ListKnowledgeSourcesRequestSchema,
  DeleteKnowledgeSourceRequestSchema,
  SearchKnowledgeBySessionRequestSchema,
} from '@/gen/mirai/v1/knowledge_service_pb';

// =============================================================================
// Upload & Process Hook (Wizard Flow)
// =============================================================================

export interface UploadAndProcessParams {
  sessionId: string;
  filename: string;
  contentType: string;
  fileContent: Uint8Array;
}

export interface UploadAndProcessResult {
  sourceId: string;
  name: string;
  summary: string;
  chunkCount: number;
  tokenCount: number;
}

/**
 * Upload and process a file for RAG indexing
 * Used in wizard flow for immediate file processing with RAG verification
 */
export function useUploadAndProcess() {
  const queryClient = useQueryClient();
  const mutation = useMutation(uploadAndProcess);

  return {
    mutate: async (params: UploadAndProcessParams): Promise<UploadAndProcessResult> => {
      const request = create(UploadAndProcessRequestSchema, {
        sessionId: params.sessionId,
        filename: params.filename,
        contentType: params.contentType,
        fileContent: params.fileContent,
      });

      const result = await mutation.mutateAsync(request);

      // Invalidate session sources list
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listKnowledgeSourcesBySession,
          cardinality: undefined,
        }),
      });

      return {
        sourceId: result.source?.id ?? '',
        name: result.source?.name ?? params.filename,
        summary: result.ragSummary,
        chunkCount: result.source?.chunkCount ?? 0,
        tokenCount: result.source?.tokenCount ?? 0,
      };
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// List Knowledge Sources Hooks
// =============================================================================

/**
 * List knowledge sources by session ID (wizard flow)
 */
export function useListKnowledgeSourcesBySession(sessionId: string | undefined) {
  const query = useQuery(
    listKnowledgeSourcesBySession,
    sessionId ? { sessionId } : undefined,
    { enabled: !!sessionId }
  );

  return {
    data: query.data?.sources ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * List knowledge sources by course ID
 */
export function useListKnowledgeSources(courseId: string | undefined) {
  const query = useQuery(
    listKnowledgeSources,
    courseId ? { courseId } : undefined,
    { enabled: !!courseId }
  );

  return {
    data: query.data?.sources ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// =============================================================================
// Link Session to Course Hook
// =============================================================================

/**
 * Link all knowledge sources from a session to a course
 * Used after course creation in wizard flow
 */
export function useLinkSessionToCourse() {
  const queryClient = useQueryClient();
  const mutation = useMutation(linkSessionToCourse);

  return {
    mutate: async (params: { sessionId: string; courseId: string }) => {
      const request = create(LinkSessionToCourseRequestSchema, {
        sessionId: params.sessionId,
        courseId: params.courseId,
      });

      const result = await mutation.mutateAsync(request);

      // Invalidate course sources list
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listKnowledgeSources,
          cardinality: undefined,
        }),
      });

      return {
        linkedCount: result.linkedCount,
      };
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Delete Knowledge Source Hook
// =============================================================================

/**
 * Delete a knowledge source and its vectors
 */
export function useDeleteKnowledgeSource() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteKnowledgeSource);

  return {
    mutate: async (id: string) => {
      const request = create(DeleteKnowledgeSourceRequestSchema, { id });
      const result = await mutation.mutateAsync(request);

      // Invalidate both session and course source lists
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listKnowledgeSourcesBySession,
          cardinality: undefined,
        }),
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listKnowledgeSources,
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
// Search Knowledge Hook
// =============================================================================

/**
 * Search knowledge by session for RAG context
 */
export function useSearchKnowledgeBySession() {
  const mutation = useMutation(searchKnowledgeBySession);

  return {
    mutate: async (params: { sessionId: string; query: string; topK?: number }) => {
      const request = create(SearchKnowledgeBySessionRequestSchema, {
        sessionId: params.sessionId,
        query: params.query,
        topK: params.topK ?? 5,
      });

      const result = await mutation.mutateAsync(request);

      return {
        chunks: result.chunks,
      };
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
