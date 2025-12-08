import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  exportCourse,
  getExportStatus,
  downloadExport,
  listExports,
} from '@/gen/mirai/v1/course-CourseService_connectquery';
import {
  ExportFormat,
  ExportStatus,
  type CourseExport,
  ExportCourseRequestSchema,
  GetExportStatusRequestSchema,
  DownloadExportRequestSchema,
  ListExportsRequestSchema,
} from '@/gen/mirai/v1/course_pb';

// Re-export types and enums
export { ExportFormat, ExportStatus };
export type { CourseExport };

/**
 * Hook to initiate a course export.
 * Returns the export record for polling.
 */
export function useExportCourse() {
  const queryClient = useQueryClient();
  const mutation = useMutation(exportCourse);

  return {
    mutate: async (courseId: string, format: ExportFormat = ExportFormat.SCORM_2004) => {
      const request = create(ExportCourseRequestSchema, {
        courseId,
        format,
      });

      const result = await mutation.mutateAsync(request);
      // Invalidate export list for this course
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listExports, cardinality: undefined }),
      });
      return result.export;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Hook to get export status with automatic polling.
 * Polls every 2 seconds while export is pending/processing.
 * @param exportId - The export ID to fetch
 * @param options - Optional configuration
 * @param options.enabled - Whether the query is enabled (default: true if exportId is provided)
 * @param options.refetchInterval - Override auto-polling interval. Set to false to disable auto-polling.
 */
export function useGetExportStatus(
  exportId: string | undefined,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  const query = useQuery(
    getExportStatus,
    exportId ? create(GetExportStatusRequestSchema, { exportId }) : undefined,
    {
      enabled: options?.enabled ?? !!exportId,
      // Use provided refetchInterval, or default to auto-poll when export is in progress
      refetchInterval: options?.refetchInterval !== undefined
        ? options.refetchInterval
        : (data) => {
            // Default: poll every 2 seconds if export is in progress
            const exp = data.state.data?.export;
            if (exp?.status === ExportStatus.PENDING ||
                exp?.status === ExportStatus.PROCESSING) {
              return 2000;
            }
            return false;
          },
    }
  );

  return {
    data: query.data?.export,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get a presigned download URL for a completed export.
 */
export function useDownloadExport() {
  const mutation = useMutation(downloadExport);

  return {
    mutate: async (exportId: string) => {
      const request = create(DownloadExportRequestSchema, { exportId });
      const result = await mutation.mutateAsync(request);
      return {
        downloadUrl: result.downloadUrl,
        expiresAt: result.expiresAt,
      };
    },
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Hook to list all exports for a course.
 */
export function useListExports(courseId: string | undefined) {
  const query = useQuery(
    listExports,
    courseId ? create(ListExportsRequestSchema, { courseId }) : undefined,
    { enabled: !!courseId }
  );

  return {
    data: query.data?.exports ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook that combines export initiation and status polling.
 * Provides a simpler interface for the export modal.
 */
export function useCourseExport() {
  const { mutate: startExport, isLoading: isStarting, error: startError, reset: resetStart } = useExportCourse();
  const { mutate: getDownload, isLoading: isGettingDownload, error: downloadError, reset: resetDownload } = useDownloadExport();

  return {
    startExport,
    getDownload,
    isStarting,
    isGettingDownload,
    startError,
    downloadError,
    reset: () => {
      resetStart();
      resetDownload();
    },
  };
}
