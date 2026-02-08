'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { usePreviewData } from '@/hooks/usePreviewData';
import { usePreviewProgress } from '@/hooks/usePreviewProgress';
import { ViewerLayout } from '@/components/preview/viewer';

export default function LessonViewerPage() {
  const params = useParams();
  const router = useRouter();

  const courseId = params.courseId as string;
  const lessonIndex = parseInt(params.lessonIndex as string, 10);

  const preview = usePreviewData(courseId);
  const progress = usePreviewProgress(courseId, preview.totalLessons);

  // Validate lesson index
  const isValidIndex = !isNaN(lessonIndex) && lessonIndex >= 0 && lessonIndex < preview.totalLessons;
  const currentLesson = isValidIndex ? preview.lessons[lessonIndex] : null;

  // Mark current lesson as completed when navigating to next
  const handleNavigate = (newIndex: number) => {
    // Mark current as completed if moving forward
    if (newIndex > lessonIndex && currentLesson) {
      progress.markComplete(currentLesson.id);
    }
    // If navigating beyond last lesson (from completion), stay on current page
    if (newIndex >= preview.totalLessons) {
      return;
    }
    router.push(`/preview/${courseId}/lesson/${newIndex}`);
  };

  // Redirect to landing if invalid index (after data loads)
  useEffect(() => {
    if (!preview.isLoading && preview.totalLessons > 0 && !isValidIndex) {
      router.replace(`/preview/${courseId}`);
    }
  }, [preview.isLoading, preview.totalLessons, isValidIndex, courseId, router]);

  if (preview.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary">Loading lesson...</p>
        </div>
      </div>
    );
  }

  if (preview.error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold text-primary mb-2">Failed to load lesson</h2>
          <p className="text-secondary mb-4">{preview.error.message}</p>
          <button
            onClick={() => router.push(`/preview/${courseId}`)}
            className="text-primary-600 hover:underline"
          >
            Return to Course
          </button>
        </div>
      </div>
    );
  }

  if (!currentLesson) {
    return null; // Will redirect via useEffect
  }

  return (
    <ViewerLayout
      preview={preview}
      currentLesson={currentLesson}
      currentIndex={lessonIndex}
      completedLessons={progress.completedLessons}
      progressPercent={progress.progressPercent}
      onNavigate={handleNavigate}
      onResetProgress={progress.resetProgress}
    />
  );
}
