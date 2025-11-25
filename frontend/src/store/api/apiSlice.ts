import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// LibraryEntry type for course listings
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

// Folder structure
export interface FolderNode {
  id: string;
  name: string;
  type?: 'library' | 'team' | 'personal' | 'folder';
  children?: FolderNode[];
  courseCount?: number;
}

// Course data for mutations
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
  status?: 'draft' | 'published' | 'generated';
  metadata?: any;
  settings?: any;
  sections?: any[];
  [key: string]: any; // Allow additional properties
}

/**
 * RTK Query API slice for all server communication
 *
 * Tag System:
 * - 'Course' tag: Invalidated when courses are created/updated/deleted
 * - 'Folder' tag: Invalidated when courses are created/updated/deleted (counts change)
 *
 * This eliminates manual cache invalidation - mutations automatically
 * refetch any queries that use the invalidated tags.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Course', 'Folder'],
  endpoints: (builder) => ({
    // ============ QUERIES ============

    /**
     * Get folder hierarchy with optional course counts
     * Provides: ['Folder'] tag
     */
    getFolders: builder.query<FolderNode[], boolean>({
      query: (includeCourseCount = true) => `/folders?includeCourseCount=${includeCourseCount}`,
      transformResponse: (response: { success: boolean; data: FolderNode[] }) => response.data,
      providesTags: ['Folder']
    }),

    /**
     * Get all courses (library entries)
     * Provides: ['Course'] tag
     */
    getCourses: builder.query<LibraryEntry[], void>({
      query: () => '/courses',
      transformResponse: (response: { success: boolean; data: LibraryEntry[] }) => response.data,
      providesTags: ['Course']
    }),

    /**
     * Get a specific course by ID
     * Provides: ['Course'] tag with ID
     */
    getCourse: builder.query<any, string>({
      query: (id) => `/courses/${id}`,
      transformResponse: (response: { success: boolean; data: any }) => response.data,
      providesTags: (result, error, id) => [{ type: 'Course', id }]
    }),

    // ============ MUTATIONS ============

    /**
     * Create a new course
     * Invalidates: ['Course', 'Folder'] - refetches course lists and folder counts
     */
    createCourse: builder.mutation<any, CourseData>({
      query: (courseData) => ({
        url: '/courses',
        method: 'POST',
        body: {
          ...courseData,
          // Ensure we have an ID for the course
          id: courseData.id || `course-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        }
      }),
      transformResponse: (response: { success: boolean; data: any }) => response.data,
      invalidatesTags: ['Course', 'Folder']
    }),

    /**
     * Update an existing course
     * Invalidates: ['Course', 'Folder'] - refetches course lists and folder counts
     */
    updateCourse: builder.mutation<any, { id: string; data: CourseData }>({
      query: ({ id, data }) => ({
        url: `/courses/${id}`,
        method: 'PUT',
        body: data
      }),
      transformResponse: (response: { success: boolean; data: any }) => response.data,
      invalidatesTags: (result, error, { id }) => [
        'Course',
        'Folder',
        { type: 'Course', id }
      ]
    }),

    /**
     * Delete a course
     * Invalidates: ['Course', 'Folder'] - refetches course lists and folder counts
     */
    deleteCourse: builder.mutation<void, string>({
      query: (id) => ({
        url: `/courses/${id}`,
        method: 'DELETE'
      }),
      invalidatesTags: ['Course', 'Folder']
    })
  })
});

// Export hooks for usage in components
export const {
  useGetFoldersQuery,
  useGetCoursesQuery,
  useGetCourseQuery,
  useCreateCourseMutation,
  useUpdateCourseMutation,
  useDeleteCourseMutation
} = api;
