'use client';

import { useState, useCallback, useEffect } from 'react';

interface PreviewProgress {
  completedLessons: Set<string>;
  progressPercent: number;
  isCompleted: (lessonId: string) => boolean;
  markComplete: (lessonId: string) => void;
  markIncomplete: (lessonId: string) => void;
  resetProgress: () => void;
}

function getStorageKey(courseId: string): string {
  return `preview-progress-${courseId}`;
}

function loadProgress(courseId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const stored = localStorage.getItem(getStorageKey(courseId));
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Set(parsed);
    }
  } catch {
    // Invalid data, ignore
  }
  return new Set();
}

function saveProgress(courseId: string, completed: Set<string>): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(getStorageKey(courseId), JSON.stringify([...completed]));
  } catch {
    // Storage full or unavailable, ignore
  }
}

export function usePreviewProgress(courseId: string, totalLessons: number): PreviewProgress {
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(() =>
    loadProgress(courseId)
  );

  // Reload when courseId changes
  useEffect(() => {
    setCompletedLessons(loadProgress(courseId));
  }, [courseId]);

  // Calculate progress percentage
  const progressPercent = totalLessons > 0
    ? Math.round((completedLessons.size / totalLessons) * 100)
    : 0;

  const isCompleted = useCallback((lessonId: string) => {
    return completedLessons.has(lessonId);
  }, [completedLessons]);

  const markComplete = useCallback((lessonId: string) => {
    setCompletedLessons((prev) => {
      const next = new Set(prev);
      next.add(lessonId);
      saveProgress(courseId, next);
      return next;
    });
  }, [courseId]);

  const markIncomplete = useCallback((lessonId: string) => {
    setCompletedLessons((prev) => {
      const next = new Set(prev);
      next.delete(lessonId);
      saveProgress(courseId, next);
      return next;
    });
  }, [courseId]);

  const resetProgress = useCallback(() => {
    setCompletedLessons(new Set());
    localStorage.removeItem(getStorageKey(courseId));
  }, [courseId]);

  return {
    completedLessons,
    progressPercent,
    isCompleted,
    markComplete,
    markIncomplete,
    resetProgress,
  };
}
