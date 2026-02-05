// Barrel re-exports for ai-generation hooks
// All existing consumers can import from '@/hooks/useAIGeneration' unchanged.

export { useGenerateCourseOutline, useGetCourseOutline, useUpdateCourseOutline } from './useOutline';
export { useGenerateAllLessons, useRegenerateComponent, useGetGeneratedLesson, useListGeneratedLessons, useGenerateComponentImage, useUpdateLessonComponents } from './useLessons';
export { useGetJob, useCancelJob, useActiveGenerationJobs } from './useJobs';

// Re-export types and enums
export {
  GenerationJobType,
  GenerationJobStatus,
  OutlineApprovalStatus,
} from '@/gen/mirai/v1/ai_generation_types_pb';
export type {
  GenerationJob,
  CourseOutline,
  OutlineSection,
  OutlineLesson,
  GeneratedLesson,
  LessonComponent,
  CourseGenerationInput,
} from '@/gen/mirai/v1/ai_generation_types_pb';
export { LessonComponentType } from '@/gen/mirai/v1/component_enums_pb';
