import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  generateAllLessons,
  regenerateComponent,
  getGeneratedLesson,
  listGeneratedLessons,
  generateComponentImage,
  updateLessonComponents,
} from '@/gen/mirai/v1/ai_generation_service-AIGenerationService_connectquery';
import {
  LessonComponentSchema,
  ComponentAlignmentSchema,
  ComponentAlignmentTargetsSchema,
} from '@/gen/mirai/v1/ai_generation_types_pb';
import { LessonComponentType } from '@/gen/mirai/v1/component_enums_pb';
import {
  GenerateAllLessonsRequestSchema,
  RegenerateComponentRequestSchema,
  GenerateComponentImageRequestSchema,
  UpdateLessonComponentsRequestSchema,
} from '@/gen/mirai/v1/ai_generation_service_pb';
import { invalidateJobQueries } from './shared';

export function useGenerateAllLessons() {
  const queryClient = useQueryClient();
  const mutation = useMutation(generateAllLessons);

  return {
    mutate: async (courseId: string) => {
      const request = create(GenerateAllLessonsRequestSchema, { courseId });

      const result = await mutation.mutateAsync(request);
      await invalidateJobQueries(queryClient);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useRegenerateComponent() {
  const queryClient = useQueryClient();
  const mutation = useMutation(regenerateComponent);

  return {
    mutate: async (data: {
      courseId: string;
      generatedLessonId: string;
      componentId: string;
      modificationPrompt: string;
      alignmentTargets?: {
        personaIds: string[];
        learningObjectiveIds: string[];
      };
    }) => {
      const request = create(RegenerateComponentRequestSchema, {
        courseId: data.courseId,
        generatedLessonId: data.generatedLessonId,
        componentId: data.componentId,
        modificationPrompt: data.modificationPrompt,
        alignmentTargets: data.alignmentTargets
          ? create(ComponentAlignmentTargetsSchema, {
              personaIds: data.alignmentTargets.personaIds,
              learningObjectiveIds: data.alignmentTargets.learningObjectiveIds,
            })
          : undefined,
      });

      const result = await mutation.mutateAsync(request);
      await Promise.all([
        invalidateJobQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getGeneratedLesson, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listGeneratedLessons, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useGetGeneratedLesson(lessonId: string | undefined) {
  const query = useQuery(
    getGeneratedLesson,
    lessonId ? { lessonId } : undefined,
    { enabled: !!lessonId }
  );

  return {
    data: query.data?.lesson,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useListGeneratedLessons(courseId: string | undefined) {
  const query = useQuery(
    listGeneratedLessons,
    courseId ? { courseId } : undefined,
    { enabled: !!courseId }
  );

  return {
    data: query.data?.lessons ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useGenerateComponentImage() {
  const queryClient = useQueryClient();
  const mutation = useMutation(generateComponentImage);

  return {
    mutate: async (data: {
      courseId: string;
      generatedLessonId: string;
      componentId: string;
      prompt: string;
      aspectRatio?: string;
    }) => {
      const request = create(GenerateComponentImageRequestSchema, {
        courseId: data.courseId,
        generatedLessonId: data.generatedLessonId,
        componentId: data.componentId,
        prompt: data.prompt,
        aspectRatio: data.aspectRatio,
      });

      const result = await mutation.mutateAsync(request);
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: getGeneratedLesson, cardinality: undefined }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

export function useUpdateLessonComponents() {
  const queryClient = useQueryClient();
  const mutation = useMutation(updateLessonComponents);

  return {
    mutate: async (data: {
      courseId: string;
      generatedLessonId: string;
      components: Array<{
        id: string;
        type: LessonComponentType;
        order: number;
        contentJson: string;
        alignment?: {
          learningObjectiveIds?: string[];
        };
      }>;
    }) => {
      const protoComponents = data.components.map((c) =>
        create(LessonComponentSchema, {
          id: c.id,
          type: c.type,
          order: c.order,
          contentJson: c.contentJson,
          alignment: c.alignment
            ? create(ComponentAlignmentSchema, {
                learningObjectiveIds: c.alignment.learningObjectiveIds ?? [],
              })
            : undefined,
        })
      );

      const request = create(UpdateLessonComponentsRequestSchema, {
        courseId: data.courseId,
        generatedLessonId: data.generatedLessonId,
        components: protoComponents,
      });

      const result = await mutation.mutateAsync(request);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: getGeneratedLesson, cardinality: undefined }),
        }),
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({ schema: listGeneratedLessons, cardinality: undefined }),
        }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
