import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  getFolderHierarchy,
  getLibrary,
  createFolder,
  deleteFolder,
} from '@/gen/mirai/v1/course-CourseService_connectquery';
import {
  CourseStatus,
  FolderType,
  type Course,
  type LibraryEntry,
  type Folder,
  type Library,
  CreateCourseRequestSchema,
  UpdateCourseRequestSchema,
  DeleteCourseRequestSchema,
  CreateFolderRequestSchema,
  DeleteFolderRequestSchema,
  CourseSettingsSchema,
  PersonaSchema,
  LearningObjectiveSchema,
  AssessmentSettingsSchema,
  CourseContentSchema,
  CourseSectionSchema,
  CourseBlockSchema,
  LessonSchema,
} from '@/gen/mirai/v1/course_pb';
import { create } from '@bufbuild/protobuf';

// Re-export types for convenience
export { CourseStatus, FolderType };
export type { Course, LibraryEntry, Folder, Library };

/**
 * Hook to list courses with optional filters.
 */
export function useListCourses(filters?: {
  status?: CourseStatus;
  folder?: string;
  tags?: string[];
}) {
  const query = useQuery(listCourses, {
    status: filters?.status,
    folder: filters?.folder,
    tags: filters?.tags ?? [],
  });

  return {
    data: query.data?.courses ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get a single course by ID.
 */
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

/**
 * Hook to create a new course.
 */
export function useCreateCourse() {
  const queryClient = useQueryClient();
  const mutation = useMutation(createCourse);

  return {
    mutate: async (courseData: {
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
    }) => {
      const request = create(CreateCourseRequestSchema, {
        id: courseData.id,
        settings: courseData.settings
          ? create(CourseSettingsSchema, {
              title: courseData.settings.title ?? '',
              desiredOutcome: courseData.settings.desiredOutcome ?? '',
              destinationFolder: courseData.settings.destinationFolder ?? '',
              categoryTags: courseData.settings.categoryTags ?? [],
              dataSource: courseData.settings.dataSource ?? '',
            })
          : undefined,
        personas: courseData.personas?.map((p) =>
          create(PersonaSchema, {
            id: p.id,
            name: p.name,
            role: p.role,
            kpis: p.kpis,
            responsibilities: p.responsibilities,
            challenges: p.challenges,
            concerns: p.concerns,
            knowledge: p.knowledge,
            learningObjectives: p.learningObjectives?.map((lo) =>
              create(LearningObjectiveSchema, { id: lo.id, text: lo.text })
            ) ?? [],
          })
        ) ?? [],
        learningObjectives: courseData.learningObjectives?.map((lo) =>
          create(LearningObjectiveSchema, { id: lo.id, text: lo.text })
        ) ?? [],
        assessmentSettings: courseData.assessmentSettings
          ? create(AssessmentSettingsSchema, {
              enableEmbeddedKnowledgeChecks:
                courseData.assessmentSettings.enableEmbeddedKnowledgeChecks ?? true,
              enableFinalExam: courseData.assessmentSettings.enableFinalExam ?? true,
            })
          : undefined,
        content: courseData.content
          ? create(CourseContentSchema, {
              sections: courseData.content.sections?.map((s) =>
                create(CourseSectionSchema, {
                  id: s.id,
                  name: s.name,
                  lessons: s.lessons?.map((l) =>
                    create(LessonSchema, {
                      id: l.id,
                      title: l.title,
                      content: l.content,
                      blocks: l.blocks?.map((b) =>
                        create(CourseBlockSchema, {
                          id: b.id,
                          type: b.type,
                          content: b.content,
                          prompt: b.prompt,
                          order: b.order,
                        })
                      ) ?? [],
                    })
                  ) ?? [],
                })
              ) ?? [],
              courseBlocks: courseData.content.courseBlocks?.map((b) =>
                create(CourseBlockSchema, {
                  id: b.id,
                  type: b.type,
                  content: b.content,
                  prompt: b.prompt,
                  order: b.order,
                })
              ) ?? [],
            })
          : undefined,
      });

      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation with createConnectQueryKey
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listCourses, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getFolderHierarchy, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getLibrary, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to update an existing course.
 */
export function useUpdateCourse() {
  const queryClient = useQueryClient();
  const mutation = useMutation(updateCourse);

  return {
    mutate: async (
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
    ) => {
      const request = create(UpdateCourseRequestSchema, {
        id: courseId,
        settings: courseData.settings
          ? create(CourseSettingsSchema, {
              title: courseData.settings.title ?? '',
              desiredOutcome: courseData.settings.desiredOutcome ?? '',
              destinationFolder: courseData.settings.destinationFolder ?? '',
              categoryTags: courseData.settings.categoryTags ?? [],
              dataSource: courseData.settings.dataSource ?? '',
            })
          : undefined,
        personas: courseData.personas?.map((p) =>
          create(PersonaSchema, {
            id: p.id,
            name: p.name,
            role: p.role,
            kpis: p.kpis,
            responsibilities: p.responsibilities,
            challenges: p.challenges,
            concerns: p.concerns,
            knowledge: p.knowledge,
            learningObjectives: p.learningObjectives?.map((lo) =>
              create(LearningObjectiveSchema, { id: lo.id, text: lo.text })
            ) ?? [],
          })
        ) ?? [],
        learningObjectives: courseData.learningObjectives?.map((lo) =>
          create(LearningObjectiveSchema, { id: lo.id, text: lo.text })
        ) ?? [],
        assessmentSettings: courseData.assessmentSettings
          ? create(AssessmentSettingsSchema, {
              enableEmbeddedKnowledgeChecks:
                courseData.assessmentSettings.enableEmbeddedKnowledgeChecks ?? true,
              enableFinalExam: courseData.assessmentSettings.enableFinalExam ?? true,
            })
          : undefined,
        content: courseData.content
          ? create(CourseContentSchema, {
              sections: courseData.content.sections?.map((s) =>
                create(CourseSectionSchema, {
                  id: s.id,
                  name: s.name,
                  lessons: s.lessons?.map((l) =>
                    create(LessonSchema, {
                      id: l.id,
                      title: l.title,
                      content: l.content,
                      blocks: l.blocks?.map((b) =>
                        create(CourseBlockSchema, {
                          id: b.id,
                          type: b.type,
                          content: b.content,
                          prompt: b.prompt,
                          order: b.order,
                        })
                      ) ?? [],
                    })
                  ) ?? [],
                })
              ) ?? [],
              courseBlocks: courseData.content.courseBlocks?.map((b) =>
                create(CourseBlockSchema, {
                  id: b.id,
                  type: b.type,
                  content: b.content,
                  prompt: b.prompt,
                  order: b.order,
                })
              ) ?? [],
            })
          : undefined,
        status: courseData.status,
      });

      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation with createConnectQueryKey
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listCourses, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getCourse, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getFolderHierarchy, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getLibrary, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to delete a course.
 */
export function useDeleteCourse() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteCourse);

  return {
    mutate: async (courseId: string) => {
      const request = create(DeleteCourseRequestSchema, { id: courseId });
      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation with createConnectQueryKey
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listCourses, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getFolderHierarchy, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getLibrary, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to get folder hierarchy.
 */
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

/**
 * Hook to get the full library (courses + folders).
 */
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

/**
 * Hook to create a new folder.
 */
export function useCreateFolder() {
  const queryClient = useQueryClient();
  const mutation = useMutation(createFolder);

  return {
    mutate: async (folderData: {
      name: string;
      parentId?: string;
      type?: FolderType;
    }) => {
      const request = create(CreateFolderRequestSchema, {
        name: folderData.name,
        parentId: folderData.parentId,
        type: folderData.type ?? FolderType.FOLDER,
      });

      const result = await mutation.mutateAsync(request);
      // Invalidate folder-related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getFolderHierarchy, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getLibrary, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to delete a folder.
 */
export function useDeleteFolder() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteFolder);

  return {
    mutate: async (folderId: string) => {
      const request = create(DeleteFolderRequestSchema, { id: folderId });
      const result = await mutation.mutateAsync(request);
      // Invalidate folder-related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getFolderHierarchy, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getLibrary, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
