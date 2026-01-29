'use client';

import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { usePreviewData } from '@/hooks/usePreviewData';
import { LandingHero, TableOfContents } from '@/components/preview/landing';

export default function PreviewLandingPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;

  const preview = usePreviewData(courseId);

  const handleStart = () => {
    router.push(`/preview/${courseId}/lesson/0`);
  };

  const handleLessonClick = (globalIndex: number) => {
    router.push(`/preview/${courseId}/lesson/${globalIndex}`);
  };

  if (preview.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary">Loading course...</p>
        </div>
      </div>
    );
  }

  if (preview.error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold text-primary mb-2">Failed to load course</h2>
          <p className="text-secondary mb-4">{preview.error.message}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-primary-600 hover:underline"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <LandingHero
        courseId={courseId}
        title={preview.courseTitle}
        description={preview.courseDescription}
        sectionCount={preview.sections.length}
        lessonCount={preview.totalLessons}
        onStart={handleStart}
      />

      {preview.sections.length > 0 && (
        <TableOfContents
          sections={preview.sections}
          onLessonClick={handleLessonClick}
        />
      )}
    </div>
  );
}
