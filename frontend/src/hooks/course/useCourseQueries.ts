import { useQuery } from '@connectrpc/connect-query';
import {
  listCourses,
  getCourse,
  getFolderHierarchy,
  getLibrary,
} from '@/gen/mirai/v1/course-CourseService_connectquery';
import {
  CourseStatus,
  FolderType,
  type Course,
  type LibraryEntry,
  type Folder,
  type Library,
} from '@/gen/mirai/v1/course_pb';

// Re-export types for convenience
export { CourseStatus, FolderType };
export type { Course, LibraryEntry, Folder, Library };

export function useListCourses(options?: {
  status?: CourseStatus;
  folder?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}) {
  const query = useQuery(listCourses, {
    status: options?.status,
    folder: options?.folder,
    tags: options?.tags ?? [],
    limit: options?.limit ?? 20,
    offset: options?.offset ?? 0,
  });

  return {
    data: query.data?.courses ?? [],
    totalCount: query.data?.totalCount ?? 0,
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useGetCourse(courseId: string | undefined) {
  const query = useQuery(
    getCourse,
    courseId ? { id: courseId } : undefined,
    { enabled: !!courseId }
  );

  return {
    data: query.data?.course,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useGetFolderHierarchy(includeCourseCounts: boolean = true) {
  const query = useQuery(getFolderHierarchy, {
    includeCourseCounts,
  });

  return {
    data: query.data?.folders ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useGetLibrary(includeCourseCounts: boolean = true) {
  const query = useQuery(getLibrary, {
    includeCourseCounts,
  });

  return {
    data: query.data?.library,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
