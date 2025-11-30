/**
 * API Slice - Course Operations
 *
 * This file re-exports connect-query hooks for course operations.
 * Previously used RTK Query, now migrated to connect-query for proto-first gRPC.
 *
 * Note: The underlying hooks now call the Go backend's CourseService
 * via Connect-RPC instead of Next.js API routes.
 */

import { useListCourses, useGetCourse, useGetFolderHierarchy, useCreateCourse, useUpdateCourse, useDeleteCourse } from '@/hooks/useCourses';
import type { LibraryEntry as ProtoLibraryEntry, Folder as ProtoFolder } from '@/hooks/useCourses';

// Frontend type definitions (matching existing schemas)
export interface LibraryEntry {
  id: string;
  title: string;
  status: 'draft' | 'published';
  folder: string;
  tags: string[];
  createdAt: string;
  modifiedAt: string;
  createdBy?: string;
  thumbnailPath?: string;
}

export interface FolderNode {
  id: string;
  name: string;
  parentId?: string;
  type?: 'library' | 'team' | 'personal' | 'folder';
  children?: FolderNode[];
  courseCount?: number;
}

export interface CourseData {
  id?: string;
  title?: string;
  desiredOutcome?: string;
  destinationFolder?: string;
  categoryTags?: string[];
  dataSource?: string;
  personas?: any[];
  learningObjectives?: any[];
  assessmentSettings?: any;
  content?: any;
}

// Helper to convert protobuf Timestamp to ISO string
function timestampToISOString(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  // protobuf-es Timestamp has toDate() method
  if (typeof (ts as any).toDate === 'function') {
    return (ts as any).toDate().toISOString();
  }
  // Fallback for plain objects with seconds/nanos
  if (typeof ts === 'object' && 'seconds' in (ts as any)) {
    const seconds = Number((ts as any).seconds) || 0;
    return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

// Conversion helpers
function convertProtoLibraryEntry(entry: ProtoLibraryEntry): LibraryEntry {
  // Map CourseStatus enum to string
  // Proto enum values: UNSPECIFIED=0, DRAFT=1, PUBLISHED=2, GENERATED=3
  const statusMap: Record<number, 'draft' | 'published'> = {
    0: 'draft', // UNSPECIFIED -> draft
    1: 'draft', // DRAFT
    2: 'published', // PUBLISHED
    3: 'draft', // GENERATED -> draft
  };

  // CourseStatus is an enum - get numeric value safely
  const statusValue = typeof entry.status === 'number' ? entry.status : 0;

  return {
    id: entry.id,
    title: entry.title || '',
    status: statusMap[statusValue] || 'draft',
    folder: entry.folder || '',
    tags: entry.tags || [],
    createdAt: timestampToISOString(entry.createdAt),
    modifiedAt: timestampToISOString(entry.modifiedAt),
    createdBy: entry.createdBy,
    thumbnailPath: entry.thumbnailPath,
  };
}

function convertProtoFolder(folder: ProtoFolder): FolderNode {
  // Map FolderType enum to string
  // Proto enum values: UNSPECIFIED=0, LIBRARY=1, TEAM=2, PERSONAL=3, FOLDER=4
  const typeMap: Record<number, 'library' | 'team' | 'personal' | 'folder'> = {
    0: 'folder', // UNSPECIFIED
    1: 'library', // LIBRARY
    2: 'team', // TEAM
    3: 'personal', // PERSONAL
    4: 'folder', // FOLDER
  };

  // FolderType is an enum - get numeric value safely
  const typeValue = typeof folder.type === 'number' ? folder.type : 0;

  return {
    id: folder.id,
    name: folder.name || '',
    parentId: folder.parentId,
    type: typeMap[typeValue] || 'folder',
    children: folder.children?.map(convertProtoFolder),
    courseCount: folder.courseCount,
  };
}

/**
 * Wrapper hook for getFolders - maintains RTK Query-like interface
 */
export function useGetFoldersQuery(includeCourseCount: boolean = true) {
  const result = useGetFolderHierarchy(includeCourseCount);
  return {
    data: result.data?.map(convertProtoFolder) || [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

/**
 * Wrapper hook for getCourses - maintains RTK Query-like interface
 */
export function useGetCoursesQuery() {
  const result = useListCourses();
  return {
    data: result.data?.map(convertProtoLibraryEntry) || [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

/**
 * Wrapper hook for getCourse - maintains RTK Query-like interface
 */
export function useGetCourseQuery(courseId: string | undefined) {
  const result = useGetCourse(courseId);
  return {
    data: result.data,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

/**
 * Wrapper hook for createCourse mutation - maintains RTK Query-like interface
 */
export function useCreateCourseMutation() {
  const { mutate, isLoading, error } = useCreateCourse();

  return [
    mutate,
    { isLoading, error },
  ] as const;
}

/**
 * Wrapper hook for updateCourse mutation - maintains RTK Query-like interface
 */
export function useUpdateCourseMutation() {
  const { mutate, isLoading, error } = useUpdateCourse();

  return [
    (args: { id: string; data: any }) => mutate(args.id, args.data),
    { isLoading, error },
  ] as const;
}

/**
 * Wrapper hook for deleteCourse mutation - maintains RTK Query-like interface
 */
export function useDeleteCourseMutation() {
  const { mutate, isLoading, error } = useDeleteCourse();

  return [
    mutate,
    { isLoading, error },
  ] as const;
}

// Legacy RTK Query API object - kept for backward compatibility but empty
// Components should use the exported hooks above instead
export const api = {
  reducerPath: 'api' as const,
  reducer: (state = {}) => state,
  middleware: () => (next: any) => (action: any) => next(action),
};
