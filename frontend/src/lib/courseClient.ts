/**
 * Course Client - Direct connect-rpc client for use in Redux async thunks
 *
 * This provides a non-hook API for calling the CourseService.
 * Use this in Redux async thunks or other non-component code.
 * For React components, prefer using the hooks from @/hooks/useCourses.
 */

import { createConnectTransport } from '@connectrpc/connect-web';
import { create } from '@bufbuild/protobuf';
import {
  ListCoursesRequestSchema,
  GetCourseRequestSchema,
  CreateCourseRequestSchema,
  UpdateCourseRequestSchema,
  DeleteCourseRequestSchema,
  GetFolderHierarchyRequestSchema,
  GetLibraryRequestSchema,
  CourseSettingsSchema,
  PersonaSchema,
  LearningObjectiveSchema,
  AssessmentSettingsSchema,
  CourseContentSchema,
  CourseSectionSchema,
  CourseBlockSchema,
  LessonSchema,
  CourseStatus,
  type Course,
  type LibraryEntry,
  type Folder,
  ListCoursesResponseSchema,
  GetCourseResponseSchema,
  CreateCourseResponseSchema,
  UpdateCourseResponseSchema,
  DeleteCourseResponseSchema,
  GetFolderHierarchyResponseSchema,
  GetLibraryResponseSchema,
} from '@/gen/mirai/v1/course_pb';
import { CourseService } from '@/gen/mirai/v1/course_connect';
import { createClient, type Client } from '@connectrpc/connect';

// Create transport
const transport = createConnectTransport({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
});

// Helper to call a Connect service method
async function callMethod<I, O>(
  service: string,
  method: string,
  request: I
): Promise<O> {
  const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/${service}/${method}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Connect-Protocol-Version': '1',
    },
    credentials: 'include',
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Connect call failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * List courses with optional filters
 */
export async function listCourses(filters?: {
  status?: CourseStatus;
  folder?: string;
  tags?: string[];
}): Promise<LibraryEntry[]> {
  const request = {
    status: filters?.status,
    folder: filters?.folder,
    tags: filters?.tags ?? [],
  };
  const response = await callMethod<any, { courses: LibraryEntry[] }>(
    'mirai.v1.CourseService',
    'ListCourses',
    request
  );
  return response.courses || [];
}

/**
 * Get a single course by ID
 */
export async function getCourse(courseId: string): Promise<Course | undefined> {
  const request = { id: courseId };
  const response = await callMethod<any, { course: Course }>(
    'mirai.v1.CourseService',
    'GetCourse',
    request
  );
  return response.course;
}

/**
 * Create a new course
 */
export async function createCourse(courseData: {
  id?: string;
  settings?: {
    title?: string;
    desiredOutcome?: string;
    destinationFolder?: string;
    categoryTags?: string[];
    dataSource?: string;
  };
  personas?: Array<{
    id: string;
    name: string;
    role: string;
    kpis: string;
    responsibilities: string;
    challenges?: string;
    concerns?: string;
    knowledge?: string;
    learningObjectives?: Array<{ id: string; text: string }>;
  }>;
  learningObjectives?: Array<{ id: string; text: string }>;
  assessmentSettings?: {
    enableEmbeddedKnowledgeChecks?: boolean;
    enableFinalExam?: boolean;
  };
  content?: {
    sections?: Array<{
      id: string;
      name: string;
      lessons?: Array<{
        id: string;
        title: string;
        content?: string;
        blocks?: Array<{
          id: string;
          type: number;
          content: string;
          prompt?: string;
          order: number;
        }>;
      }>;
    }>;
    courseBlocks?: Array<{
      id: string;
      type: number;
      content: string;
      prompt?: string;
      order: number;
    }>;
  };
}): Promise<Course | undefined> {
  const response = await callMethod<any, { course: Course }>(
    'mirai.v1.CourseService',
    'CreateCourse',
    courseData
  );
  return response.course;
}

/**
 * Update an existing course
 */
export async function updateCourse(
  courseId: string,
  courseData: {
    settings?: {
      title?: string;
      desiredOutcome?: string;
      destinationFolder?: string;
      categoryTags?: string[];
      dataSource?: string;
    };
    personas?: Array<{
      id: string;
      name: string;
      role: string;
      kpis: string;
      responsibilities: string;
      challenges?: string;
      concerns?: string;
      knowledge?: string;
      learningObjectives?: Array<{ id: string; text: string }>;
    }>;
    learningObjectives?: Array<{ id: string; text: string }>;
    assessmentSettings?: {
      enableEmbeddedKnowledgeChecks?: boolean;
      enableFinalExam?: boolean;
    };
    content?: {
      sections?: Array<{
        id: string;
        name: string;
        lessons?: Array<{
          id: string;
          title: string;
          content?: string;
          blocks?: Array<{
            id: string;
            type: number;
            content: string;
            prompt?: string;
            order: number;
          }>;
        }>;
      }>;
      courseBlocks?: Array<{
        id: string;
        type: number;
        content: string;
        prompt?: string;
        order: number;
      }>;
    };
    status?: CourseStatus;
  }
): Promise<Course | undefined> {
  const response = await callMethod<any, { course: Course }>(
    'mirai.v1.CourseService',
    'UpdateCourse',
    { id: courseId, ...courseData }
  );
  return response.course;
}

/**
 * Delete a course
 */
export async function deleteCourseById(courseId: string): Promise<boolean> {
  const response = await callMethod<any, { success: boolean }>(
    'mirai.v1.CourseService',
    'DeleteCourse',
    { id: courseId }
  );
  return response.success;
}

/**
 * Get folder hierarchy
 */
export async function getFolderHierarchy(includeCourseCounts: boolean = true): Promise<Folder[]> {
  const response = await callMethod<any, { folders: Folder[] }>(
    'mirai.v1.CourseService',
    'GetFolderHierarchy',
    { includeCourseCounts }
  );
  return response.folders || [];
}

/**
 * Get library (courses + folders)
 */
export async function getLibrary(includeCourseCounts: boolean = true) {
  const response = await callMethod<any, { library: any }>(
    'mirai.v1.CourseService',
    'GetLibrary',
    { includeCourseCounts }
  );
  return response.library;
}

// Re-export types
export { CourseStatus };
export type { Course, LibraryEntry, Folder };
