'use client';

import { useParams, useRouter } from 'next/navigation';
import { BookOpen, FileText, Download, Loader2, ChevronRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useGetSharedCourse, useExportSharedPDF } from '@/hooks/useShareViewer';
import { useShareSession } from '@/store/zustand/shareSession';
import type { SharedSection, SharedLesson } from '@/gen/mirai/v1/course_share_pb';

export default function SharedCourseViewPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const { sessionToken, courseTitle: storedTitle } = useShareSession();
  const { data: course, isLoading, error } = useGetSharedCourse(sessionToken);
  const exportPDF = useExportSharedPDF();

  const handleExportPDF = async () => {
    try {
      const result = await exportPDF.mutate(sessionToken);
      if (result.downloadUrl) {
        window.open(result.downloadUrl, '_blank');
      }
    } catch {
      // Error handled by mutation state
    }
  };

  const handleLessonClick = (lessonId: string) => {
    router.push(`/shared/${token}/view/lesson/${lessonId}`);
  };

  if (!sessionToken) {
    router.push(`/shared/${token}`);
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-secondary">Failed to load course.</p>
      </div>
    );
  }

  const totalLessons = course.sections.reduce(
    (sum: number, s: SharedSection) => sum + s.lessons.length,
    0
  );

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{course.title}</h1>
              {course.desiredOutcome && (
                <p className="text-indigo-100 text-lg">
                  {course.desiredOutcome}
                </p>
              )}
              <div className="mt-4 flex items-center gap-4 text-indigo-200 text-sm">
                <span>{course.sections.length} sections</span>
                <span>{totalLessons} lessons</span>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={handleExportPDF}
              disabled={exportPDF.isLoading}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              {exportPDF.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Table of Contents */}
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h2 className="text-xl font-semibold text-primary mb-6">
          Course Contents
        </h2>
        <div className="space-y-6">
          {course.sections.map((section: SharedSection, sIdx: number) => (
            <div key={section.id} className="rounded-lg border bg-surface">
              <div className="border-b px-4 py-3">
                <h3 className="font-medium text-primary">
                  <span className="text-muted mr-2">
                    Section {sIdx + 1}
                  </span>
                  {section.title}
                </h3>
              </div>
              <div className="divide-y">
                {section.lessons.map((lesson: SharedLesson) => (
                  <button
                    key={lesson.id}
                    onClick={() => handleLessonClick(lesson.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                      <span className="text-sm text-primary">
                        {lesson.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">
                        {lesson.componentCount} components
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
