// Barrel re-exports for course hooks
// All existing consumers can import from '@/hooks/useCourses' unchanged.

export { useListCourses, useGetCourse, useGetFolderHierarchy, useGetLibrary, CourseStatus, FolderType } from './useCourseQueries';
export type { Course, LibraryEntry, Folder, Library } from './useCourseQueries';
export { useCreateCourse, useUpdateCourse, useDeleteCourse } from './useCourseMutations';
export { useCreateFolder, useDeleteFolder } from './useFolderMutations';
