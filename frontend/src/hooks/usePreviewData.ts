'use client';

import { useMemo } from 'react';
import { useGetCourseOutline, useListGeneratedLessons } from './useAIGeneration';
import { useGetCourse } from './useCourses';
import type { OutlineSection, OutlineLesson, GeneratedLesson } from '@/gen/mirai/v1/ai_generation_types_pb';

export interface FlattenedLesson {
  id: string;
  title: string;
  description: string;
  sectionIndex: number;
  sectionTitle: string;
  lessonIndex: number;
  globalIndex: number;
  content: GeneratedLesson | null;
}

export interface PreviewData {
  courseId: string;
  courseTitle: string;
  courseDescription: string;
  sections: OutlineSection[];
  lessons: FlattenedLesson[];
  totalLessons: number;
  isLoading: boolean;
  error: Error | null;
}

export function usePreviewData(courseId: string): PreviewData {
  const courseQuery = useGetCourse(courseId);
  const outlineQuery = useGetCourseOutline(courseId);
  const lessonsQuery = useListGeneratedLessons(courseId);

  const lessons = useMemo(() => {
    if (!outlineQuery.data?.sections) return [];

    const flattened: FlattenedLesson[] = [];
    let globalIndex = 0;

    outlineQuery.data.sections.forEach((section, sectionIndex) => {
      section.lessons?.forEach((lesson, lessonIndex) => {
        // Find matching generated content
        const content = lessonsQuery.data.find(
          (gen) => gen.outlineLessonId === lesson.id
        ) ?? null;

        flattened.push({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          sectionIndex,
          sectionTitle: section.title,
          lessonIndex,
          globalIndex,
          content,
        });

        globalIndex++;
      });
    });

    return flattened;
  }, [outlineQuery.data, lessonsQuery.data]);

  return {
    courseId,
    courseTitle: courseQuery.data?.settings?.title ?? 'Untitled Course',
    courseDescription: courseQuery.data?.settings?.desiredOutcome ?? '',
    sections: outlineQuery.data?.sections ?? [],
    lessons,
    totalLessons: lessons.length,
    isLoading: courseQuery.isLoading || outlineQuery.isLoading || lessonsQuery.isLoading,
    error: courseQuery.error ?? outlineQuery.error ?? lessonsQuery.error ?? null,
  };
}
