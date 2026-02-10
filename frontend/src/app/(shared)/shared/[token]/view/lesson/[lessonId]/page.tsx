'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import { useGetSharedLesson } from '@/hooks/useShareViewer';
import { useShareSession } from '@/store/zustand/shareSession';
import { ComponentRenderer } from '@/components/course/renderers/ComponentRenderer';
import { ReviewCommentsPanel } from '@/components/share/ReviewCommentsPanel';
import type { LessonComponent } from '@/gen/mirai/v1/ai_generation_types_pb';

export default function SharedLessonPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const lessonId = params.lessonId as string;

  const [showComments, setShowComments] = useState(false);

  const { sessionToken } = useShareSession();
  const { data: lesson, isLoading } = useGetSharedLesson(sessionToken, lessonId);

  useEffect(() => {
    if (!sessionToken) {
      router.push(`/shared/${token}`);
    }
  }, [sessionToken, token, router]);

  if (!sessionToken) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-secondary">Lesson not found.</p>
      </div>
    );
  }

  const commentCount = lesson.comments?.length ?? 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b bg-surface sticky top-0 z-10">
        <div className="mx-auto max-w-4xl px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push(`/shared/${token}/view`)}
            className="flex items-center gap-2 text-sm text-secondary hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to course
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-2 text-sm text-secondary hover:text-primary"
          >
            <MessageSquare className="h-4 w-4" />
            Comments ({commentCount})
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Main content */}
        <div
          className={`flex-1 transition-all ${
            showComments ? 'max-w-3xl' : 'max-w-4xl mx-auto'
          }`}
        >
          <div className="px-6 py-8">
            <h1 className="text-2xl font-bold text-primary mb-6">
              {lesson.title}
            </h1>

            {/* Render components using the real ComponentRenderer */}
            <div className="space-y-6">
              {lesson.components.map((component: LessonComponent) => (
                <ComponentRenderer
                  key={component.id}
                  component={component}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Comments sidebar */}
        <ReviewCommentsPanel
          sessionToken={sessionToken}
          lessonId={lessonId}
          isOpen={showComments}
          onToggle={() => setShowComments(!showComments)}
        />
      </div>
    </div>
  );
}
