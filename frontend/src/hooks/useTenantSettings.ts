import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  getAISettings,
  setAPIKey,
  removeAPIKey,
  testAPIKey,
  getUsageStats,
  getKnowledgeSettings,
  updateKnowledgeSettings,
} from '@/gen/mirai/v1/tenant_settings-TenantSettingsService_connectquery';
import {
  AIProvider,
  type TenantAISettings,
  type GetUsageStatsResponse,
  type UsageByType,
  type KnowledgeSettings,
  SetAPIKeyRequestSchema,
  RemoveAPIKeyRequestSchema,
  TestAPIKeyRequestSchema,
  UpdateKnowledgeSettingsRequestSchema,
} from '@/gen/mirai/v1/tenant_settings_pb';

// Re-export types and enums
export { AIProvider };
export type { TenantAISettings, GetUsageStatsResponse, UsageByType, KnowledgeSettings };

// Alias for convenience
export type AIUsageStats = GetUsageStatsResponse;

/**
 * Hook to get AI settings for the tenant.
 * Only available to ADMIN/OWNER roles.
 */
export function useGetAISettings() {
  const query = useQuery(getAISettings, {});

  return {
    data: query.data?.settings,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to set the API key.
 * Only available to ADMIN/OWNER roles.
 */
export function useSetAPIKey() {
  const queryClient = useQueryClient();
  const mutation = useMutation(setAPIKey);

  return {
    mutate: async (provider: AIProvider, apiKey: string) => {
      const request = create(SetAPIKeyRequestSchema, { provider, apiKey });
      const result = await mutation.mutateAsync(request);
      // Invalidate AI settings query using the proper connect-query key
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: getAISettings, cardinality: undefined }),
        }),
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: getUsageStats, cardinality: undefined }),
        }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to remove the API key.
 * Only available to ADMIN/OWNER roles.
 */
export function useRemoveAPIKey() {
  const queryClient = useQueryClient();
  const mutation = useMutation(removeAPIKey);

  return {
    mutate: async () => {
      const request = create(RemoveAPIKeyRequestSchema, {});
      const result = await mutation.mutateAsync(request);
      // Invalidate AI settings query using the proper connect-query key
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: getAISettings, cardinality: undefined }),
        }),
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: getUsageStats, cardinality: undefined }),
        }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to test an API key without saving it.
 * Only available to ADMIN/OWNER roles.
 */
export function useTestAPIKey() {
  const mutation = useMutation(testAPIKey);

  return {
    mutate: async (provider: AIProvider, apiKey: string) => {
      const request = create(TestAPIKeyRequestSchema, { provider, apiKey });
      return await mutation.mutateAsync(request);
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to get AI usage statistics.
 * Only available to ADMIN/OWNER roles.
 */
export function useGetUsageStats() {
  const query = useQuery(getUsageStats, {});

  return {
    data: query.data ? {
      totalTokensUsed: query.data.totalTokensUsed,
      tokensThisMonth: query.data.tokensThisMonth,
      monthlyLimit: query.data.monthlyLimit,
      usageByType: query.data.usageByType,
    } : undefined,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// =============================================================================
// Knowledge Settings Hooks
// =============================================================================

/**
 * Hook to get knowledge/RAG settings for the tenant.
 * Only available to ADMIN/OWNER roles.
 */
export function useGetKnowledgeSettings() {
  const query = useQuery(getKnowledgeSettings, {});

  return {
    data: query.data?.settings,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to update knowledge/RAG settings.
 * Only available to ADMIN/OWNER roles.
 */
export function useUpdateKnowledgeSettings() {
  const queryClient = useQueryClient();
  const mutation = useMutation(updateKnowledgeSettings);

  return {
    mutate: async (settings: {
      allowGlobalKnowledge?: boolean;
      lowGroundingThreshold?: number;
      enforceInternalOnly?: boolean;
      requireCurriculumApproval?: boolean;
    }) => {
      const request = create(UpdateKnowledgeSettingsRequestSchema, settings);
      const result = await mutation.mutateAsync(request);
      // Invalidate knowledge settings query
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: getKnowledgeSettings, cardinality: undefined }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
