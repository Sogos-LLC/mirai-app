import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  listTeamKnowledgeSources,
  getTeamKnowledgeSource,
  uploadTeamKnowledge,
  deleteTeamKnowledgeSource,
  checkDuplicateKnowledge,
} from '@/gen/mirai/v1/team_knowledge_service-TeamKnowledgeService_connectquery';
import {
  UploadTeamKnowledgeRequestSchema,
  DeleteTeamKnowledgeSourceRequestSchema,
  GetTeamKnowledgeSourceRequestSchema,
  ListTeamKnowledgeSourcesRequestSchema,
  CheckDuplicateKnowledgeRequestSchema,
} from '@/gen/mirai/v1/team_knowledge_service_pb';
import {
  KnowledgeSource,
  KnowledgeSourceStatus,
} from '@/gen/mirai/v1/knowledge_source_pb';

// Re-export types and enums
export { KnowledgeSourceStatus };
export type { KnowledgeSource };

/**
 * Compute SHA-256 hash of file content
 */
export async function computeFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Duplicate check result
 */
export interface DuplicateCheckResult {
  exists: boolean;
  existingSource?: KnowledgeSource;
  location?: string;
}

/**
 * Helper to get status display info
 */
export function getStatusInfo(status: KnowledgeSourceStatus): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (status) {
    case KnowledgeSourceStatus.PENDING:
      return {
        label: 'Pending',
        color: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      };
    case KnowledgeSourceStatus.PROCESSING:
      return {
        label: 'Processing',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      };
    case KnowledgeSourceStatus.READY:
      return {
        label: 'Ready',
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
      };
    case KnowledgeSourceStatus.FAILED:
      return {
        label: 'Failed',
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
      };
    default:
      return {
        label: 'Unknown',
        color: 'text-gray-600 dark:text-gray-400',
        bgColor: 'bg-gray-100 dark:bg-gray-900/30',
      };
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: bigint): string {
  const num = Number(bytes);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Hook to list knowledge sources.
 * @param teamId - Optional team ID. If omitted, lists global knowledge (tenant-level).
 *                 If provided, lists team-specific knowledge.
 * Refetches periodically when there are pending/processing sources.
 */
export function useListKnowledgeSources(teamId?: string) {
  const request = create(ListTeamKnowledgeSourcesRequestSchema, {
    teamId: teamId,
  });

  const query = useQuery(listTeamKnowledgeSources, request);

  // Check if any sources are still processing
  const hasActiveProcessing = query.data?.sources?.some(
    (source) =>
      source.status === KnowledgeSourceStatus.PENDING ||
      source.status === KnowledgeSourceStatus.PROCESSING
  );

  return {
    sources: query.data?.sources ?? [],
    totalSources: query.data?.totalSources ?? 0,
    totalTokens: query.data?.totalTokens ?? BigInt(0),
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    hasActiveProcessing,
  };
}

/**
 * @deprecated Use useListKnowledgeSources() instead
 * Hook to list all team knowledge sources (global knowledge).
 */
export function useListTeamKnowledgeSources() {
  return useListKnowledgeSources();
}

/**
 * Hook to get a single team knowledge source by ID.
 */
export function useGetTeamKnowledgeSource(id: string | undefined) {
  const query = useQuery(
    getTeamKnowledgeSource,
    id ? create(GetTeamKnowledgeSourceRequestSchema, { id }) : undefined,
    { enabled: !!id }
  );

  return {
    data: query.data?.source,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to check for duplicate knowledge files.
 */
export function useCheckDuplicateKnowledge() {
  const mutation = useMutation(checkDuplicateKnowledge);

  return {
    checkDuplicate: async (contentHash: string): Promise<DuplicateCheckResult> => {
      const request = create(CheckDuplicateKnowledgeRequestSchema, {
        contentHash,
      });

      const result = await mutation.mutateAsync(request);

      return {
        exists: result.exists,
        existingSource: result.existingSource,
        location: result.location,
      };
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to upload a file as knowledge.
 * @param teamId - Optional team ID. If omitted, creates global knowledge.
 *                 If provided, creates team-specific knowledge.
 */
export function useUploadKnowledge(teamId?: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation(uploadTeamKnowledge);

  return {
    mutate: async (file: File, contentHash: string) => {
      // Read file content as Uint8Array
      const arrayBuffer = await file.arrayBuffer();
      const fileContent = new Uint8Array(arrayBuffer);

      const request = create(UploadTeamKnowledgeRequestSchema, {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        fileContent,
        teamId: teamId,
        contentHash: contentHash,
      });

      const result = await mutation.mutateAsync(request);

      // Invalidate list query to refresh
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listTeamKnowledgeSources,
          cardinality: undefined,
        }),
      });

      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * @deprecated Use useUploadKnowledge() instead
 * Hook to upload a file as team knowledge (global).
 */
export function useUploadTeamKnowledge() {
  return useUploadKnowledge();
}

/**
 * Hook to delete a knowledge source.
 * @param teamId - Optional team ID for cache invalidation purposes.
 */
export function useDeleteKnowledgeSource(teamId?: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteTeamKnowledgeSource);

  return {
    mutate: async (id: string) => {
      const request = create(DeleteTeamKnowledgeSourceRequestSchema, { id });
      const result = await mutation.mutateAsync(request);

      // Invalidate list query to refresh
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listTeamKnowledgeSources,
          cardinality: undefined,
        }),
      });

      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * @deprecated Use useDeleteKnowledgeSource() instead
 * Hook to delete a team knowledge source.
 */
export function useDeleteTeamKnowledgeSource() {
  return useDeleteKnowledgeSource();
}
