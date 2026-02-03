import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { createClient } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import { transport } from '@/lib/connect';
import {
  CurriculumService,
  GetCurriculumMapRequestSchema,
  GenerateCurriculumMapRequestSchema,
  ApproveCurriculumMapRequestSchema,
  UpdateCoverageCellRequestSchema,
} from '@/gen/mirai/v1/curriculum_map_pb';
import {
  getCurriculumMap,
  generateCurriculumMap,
} from '@/gen/mirai/v1/curriculum_map-CurriculumService_connectquery';
import type {
  CurriculumMap,
  CoverageIntent,
  CoverageLevel,
} from '@/gen/mirai/v1/curriculum_map_pb';

const client = createClient(CurriculumService, transport);

/**
 * Hook to get the curriculum map for a course.
 */
export function useGetCurriculumMap(courseId: string) {
  return useQuery({
    queryKey: createConnectQueryKey({
      schema: getCurriculumMap,
      cardinality: 'finite',
      input: { courseId },
    }),
    queryFn: async () => {
      const request = create(GetCurriculumMapRequestSchema, { courseId });
      return client.getCurriculumMap(request);
    },
    enabled: !!courseId,
  });
}

/**
 * Hook to generate or regenerate the curriculum map.
 */
export function useGenerateCurriculumMap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ courseId, forceRegenerate = false }: { courseId: string; forceRegenerate?: boolean }) => {
      const request = create(GenerateCurriculumMapRequestSchema, {
        courseId,
        forceRegenerate,
      });
      return client.generateCurriculumMap(request);
    },
    onSuccess: (_, variables) => {
      // Invalidate the curriculum map query
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getCurriculumMap,
          cardinality: 'finite',
          input: { courseId: variables.courseId },
        }),
      });
    },
  });
}

/**
 * Hook to approve the curriculum map.
 */
export function useApproveCurriculumMap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ courseId, acknowledgeWarnings = false }: { courseId: string; acknowledgeWarnings?: boolean }) => {
      const request = create(ApproveCurriculumMapRequestSchema, {
        courseId,
        acknowledgeWarnings,
      });
      return client.approveCurriculumMap(request);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getCurriculumMap,
          cardinality: 'finite',
          input: { courseId: variables.courseId },
        }),
      });
    },
  });
}

/**
 * Hook to update a coverage cell.
 */
export function useUpdateCoverageCell() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      courseId,
      sectionId,
      outcomeId,
      intent,
      level,
      emphasis,
    }: {
      courseId: string;
      sectionId: string;
      outcomeId: string;
      intent: CoverageIntent;
      level: CoverageLevel;
      emphasis: number;
    }) => {
      const request = create(UpdateCoverageCellRequestSchema, {
        courseId,
        sectionId,
        outcomeId,
        intent,
        level,
        emphasis,
      });
      return client.updateCoverageCell(request);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getCurriculumMap,
          cardinality: 'finite',
          input: { courseId: variables.courseId },
        }),
      });
    },
  });
}

/**
 * Helper to check if the curriculum map is approved.
 */
export function isCurriculumMapApproved(curriculumMap: CurriculumMap | undefined | null): boolean {
  return curriculumMap?.status === 4; // CURRICULUM_MAP_STATUS_APPROVED
}

/**
 * Helper to check if the curriculum map has errors.
 */
export function hasErrors(curriculumMap: CurriculumMap | undefined | null): boolean {
  if (!curriculumMap?.issues) return false;
  return curriculumMap.issues.some(issue => issue.severity === 1); // ISSUE_SEVERITY_ERROR
}

/**
 * Helper to check if the curriculum map has warnings.
 */
export function hasWarnings(curriculumMap: CurriculumMap | undefined | null): boolean {
  if (!curriculumMap?.issues) return false;
  return curriculumMap.issues.some(issue => issue.severity === 2); // ISSUE_SEVERITY_WARNING
}
