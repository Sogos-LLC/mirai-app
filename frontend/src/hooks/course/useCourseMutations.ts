import { useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  getFolderHierarchy,
  getLibrary,
} from '@/gen/mirai/v1/course-CourseService_connectquery';
import {
  CourseStatus,
  CreateCourseRequestSchema,
  UpdateCourseRequestSchema,
  DeleteCourseRequestSchema,
  CourseSettingsSchema,
  PersonaSchema,
  LearningObjectiveSchema,
  AssessmentSettingsSchema,
  CourseContentSchema,
  CourseSectionSchema,
  CourseBlockSchema,
  LessonSchema,
} from '@/gen/mirai/v1/course_pb';
import {
  WizardStepDataSchema,
  SMEPersonaSchema,
  AudiencePersonaSchema,
  ToneOptionSchema,
  type WizardStepData,
} from '@/gen/mirai/v1/course_wizard_pb';

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
      wizardData?: Partial<WizardStepData>;
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
        wizardData: courseData.wizardData
          ? create(WizardStepDataSchema, {
              courseName: courseData.wizardData.courseName ?? '',
              desiredOutcomes: courseData.wizardData.desiredOutcomes ?? '',
              improvedTitle: courseData.wizardData.improvedTitle ?? '',
              description: courseData.wizardData.description ?? '',
              smePersonas: courseData.wizardData.smePersonas?.map(p =>
                create(SMEPersonaSchema, p)
              ) ?? [],
              selectedSmeIds: courseData.wizardData.selectedSmeIds ?? [],
              audiencePersonas: courseData.wizardData.audiencePersonas?.map(p =>
                create(AudiencePersonaSchema, p)
              ) ?? [],
              selectedAudienceIds: courseData.wizardData.selectedAudienceIds ?? [],
              toneOptions: courseData.wizardData.toneOptions?.map(t =>
                create(ToneOptionSchema, t)
              ) ?? [],
              selectedToneId: courseData.wizardData.selectedToneId ?? '',
              additionalContext: courseData.wizardData.additionalContext ?? '',
              internalDataOnly: courseData.wizardData.internalDataOnly ?? false,
            })
          : undefined,
      });

      const result = await mutation.mutateAsync(request);
      // Fire-and-forget: don't await invalidation — refetches use the transport
      // timeout and can block the caller for the full duration if queries fail.
      void Promise.all([
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
      void Promise.all([
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

export function useDeleteCourse() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteCourse);

  return {
    mutate: async (courseId: string) => {
      const request = create(DeleteCourseRequestSchema, { id: courseId });
      const result = await mutation.mutateAsync(request);
      void Promise.all([
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
