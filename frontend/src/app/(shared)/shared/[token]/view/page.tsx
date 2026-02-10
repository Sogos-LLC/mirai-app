'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Circle,
  ArrowLeft,
  ArrowRight,
  Menu,
  MessageSquare,
  X,
  Download,
  BookOpen,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  useGetSharedCourse,
  useGetSharedLesson,
  useExportSharedPDF,
} from '@/hooks/useShareViewer';
import { useShareSession } from '@/store/zustand/shareSession';
import { ReviewCommentsPanel } from '@/components/share/ReviewCommentsPanel';
import { ComponentRenderer } from '@/components/course/renderers/ComponentRenderer';
import { FadeInView } from '@/components/preview/shared/FadeInView';
import type { SharedSection, SharedLesson } from '@/gen/mirai/v1/course_share_pb';
import type { LessonComponent } from '@/gen/mirai/v1/ai_generation_types_pb';

interface FlatLesson {
  id: string;
  title: string;
  sectionTitle: string;
  sectionIndex: number;
  lessonIndex: number;
  globalIndex: number;
}

function flattenLessons(sections: SharedSection[]): FlatLesson[] {
  const result: FlatLesson[] = [];
  let globalIndex = 0;
  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    for (let li = 0; li < section.lessons.length; li++) {
      const lesson = section.lessons[li];
      result.push({
        id: lesson.id,
        title: lesson.title,
        sectionTitle: section.title,
        sectionIndex: si,
        lessonIndex: li,
        globalIndex,
      });
      globalIndex++;
    }
  }
  return result;
}

export default function SharedCourseViewPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const contentRef = useRef<HTMLDivElement>(null);

  const { sessionToken } = useShareSession();
  const { data: course, isLoading, error } = useGetSharedCourse(sessionToken);
  const exportPDF = useExportSharedPDF();

  const [currentLessonId, setCurrentLessonId] = useState<string>('');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileComments, setShowMobileComments] = useState(false);

  const flatLessons = useMemo(
    () => (course ? flattenLessons(course.sections) : []),
    [course]
  );

  // Set default lesson to first one
  useEffect(() => {
    if (flatLessons.length > 0 && !currentLessonId) {
      setCurrentLessonId(flatLessons[0].id);
    }
  }, [flatLessons, currentLessonId]);

  const currentIndex = useMemo(
    () => flatLessons.findIndex((l) => l.id === currentLessonId),
    [flatLessons, currentLessonId]
  );

  const currentFlat = currentIndex >= 0 ? flatLessons[currentIndex] : null;

  // Fetch current lesson content
  const { data: lessonData, isLoading: lessonLoading } = useGetSharedLesson(
    sessionToken,
    currentLessonId
  );

  // Scroll to top when lesson changes
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentLessonId]);

  // Redirect if no session
  useEffect(() => {
    if (!sessionToken) {
      router.push(`/shared/${token}`);
    }
  }, [sessionToken, token, router]);

  const navigateTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < flatLessons.length) {
        setCurrentLessonId(flatLessons[index].id);
        setShowMobileSidebar(false);
      }
    },
    [flatLessons]
  );

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

  if (error || !course) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-secondary">Failed to load course.</p>
      </div>
    );
  }

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < flatLessons.length - 1;
  const components: LessonComponent[] = lessonData?.components ?? [];

  return (
    <div className="flex flex-col h-screen bg-page">
      {/* Header */}
      <header className="bg-surface border-b sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3 gap-4">
          {/* Left: Menu (mobile) + course title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-hover transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center md:hidden"
            >
              <Menu className="w-5 h-5 text-secondary" />
            </button>

            <div className="hidden md:flex items-center gap-2 text-secondary min-h-[44px]">
              <BookOpen className="w-5 h-5 flex-shrink-0 text-indigo-500" />
              <span className="font-medium text-primary truncate">
                {course.title}
              </span>
            </div>

            {/* Mobile breadcrumb */}
            {currentFlat && (
              <div className="md:hidden min-w-0">
                <p className="text-xs text-muted truncate">
                  {currentFlat.sectionTitle}
                </p>
                <p className="text-sm font-medium text-primary truncate">
                  {currentFlat.title}
                </p>
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMobileComments(!showMobileComments)}
              className="md:hidden p-2 rounded-lg hover:bg-hover transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <MessageSquare className="w-5 h-5 text-secondary" />
            </button>
            <Button
              variant="secondary"
              onClick={handleExportPDF}
              disabled={exportPDF.isLoading}
              className="hidden sm:flex"
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
      </header>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <SharedSidebar
            sections={course.sections}
            currentLessonId={currentLessonId}
            onLessonClick={(lessonId) => setCurrentLessonId(lessonId)}
          />
        </div>

        {/* Content */}
        <main
          ref={contentRef}
          className="flex-1 overflow-y-auto text-lg leading-relaxed"
        >
          {lessonLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : currentFlat ? (
            <div className="max-w-5xl mx-auto px-6 sm:px-10 lg:px-16 py-12">
              {/* Lesson header */}
              <FadeInView delay={0}>
                <div className="mb-12">
                  <p className="text-lg text-muted mb-2">
                    {currentFlat.sectionTitle} &bull; Lesson{' '}
                    {currentFlat.lessonIndex + 1}
                  </p>
                  <h1 className="text-4xl md:text-5xl font-bold text-primary">
                    {currentFlat.title}
                  </h1>
                </div>
              </FadeInView>

              {/* Components */}
              {components.length > 0 ? (
                <div className="space-y-8">
                  {components.map((component, index) => (
                    <FadeInView
                      key={component.id || index}
                      delay={(index + 1) * 50}
                    >
                      <ComponentRenderer component={component} />
                    </FadeInView>
                  ))}
                </div>
              ) : (
                <FadeInView delay={100}>
                  <div className="text-center py-12 text-muted">
                    <p>No content available for this lesson.</p>
                  </div>
                </FadeInView>
              )}
            </div>
          ) : null}
        </main>

        {/* Desktop comments panel */}
        {currentLessonId && (
          <div className="hidden md:block">
            <ReviewCommentsPanel
              sessionToken={sessionToken}
              lessonId={currentLessonId}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-surface border-t px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <Button
            variant="secondary"
            onClick={() => navigateTo(currentIndex - 1)}
            disabled={!hasPrevious}
            className="min-w-[120px]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          <span className="text-sm text-muted">
            Lesson {currentIndex + 1} of {flatLessons.length}
          </span>

          <Button
            variant="primary"
            onClick={() => navigateTo(currentIndex + 1)}
            disabled={!hasNext}
            className="min-w-[120px]"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </footer>

      {/* Mobile sidebar overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMobileSidebar(false)}
          />
          <div className="absolute left-0 top-0 h-full w-80 max-w-[85vw] animate-slide-in-left">
            <div className="h-full bg-surface flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <span className="font-semibold text-primary">
                  Course Navigation
                </span>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-2 rounded-lg hover:bg-hover transition-colors"
                >
                  <X className="w-5 h-5 text-secondary" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <SharedSidebar
                  sections={course.sections}
                  currentLessonId={currentLessonId}
                  onLessonClick={(lessonId) => {
                    setCurrentLessonId(lessonId);
                    setShowMobileSidebar(false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile comments overlay */}
      {showMobileComments && currentLessonId && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMobileComments(false)}
          />
          <div className="absolute right-0 top-0 h-full w-80 max-w-[85vw]">
            <div className="h-full bg-surface flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <span className="font-semibold text-primary">Comments</span>
                <button
                  onClick={() => setShowMobileComments(false)}
                  className="p-2 rounded-lg hover:bg-hover transition-colors"
                >
                  <X className="w-5 h-5 text-secondary" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ReviewCommentsPanel
                  sessionToken={sessionToken}
                  lessonId={currentLessonId}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared Sidebar ────────────────────────────────────────────────────────────

interface SharedSidebarProps {
  sections: SharedSection[];
  currentLessonId: string;
  onLessonClick: (lessonId: string) => void;
}

function SharedSidebar({
  sections,
  currentLessonId,
  onLessonClick,
}: SharedSidebarProps) {
  // Find which section contains the current lesson
  const currentSectionIndex = useMemo(() => {
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].lessons.some((l) => l.id === currentLessonId)) {
        return i;
      }
    }
    return 0;
  }, [sections, currentLessonId]);

  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    () => new Set([currentSectionIndex])
  );

  // Expand section when current lesson changes to a new section
  useEffect(() => {
    setExpandedSections((prev) => {
      if (prev.has(currentSectionIndex)) return prev;
      const next = new Set(prev);
      next.add(currentSectionIndex);
      return next;
    });
  }, [currentSectionIndex]);

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <aside className="w-80 bg-surface border-r flex flex-col h-full overflow-hidden">
      {/* Sections list */}
      <nav className="flex-1 overflow-y-auto">
        {sections.map((section, sectionIndex) => {
          const isExpanded = expandedSections.has(sectionIndex);

          return (
            <div
              key={section.id || sectionIndex}
              className="border-b last:border-b-0"
            >
              {/* Section header */}
              <button
                onClick={() => toggleSection(sectionIndex)}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-hover transition-colors text-left"
              >
                <span className="text-muted">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                </span>
                <span className="text-base font-medium text-primary truncate flex-1">
                  {section.title}
                </span>
              </button>

              {/* Lessons */}
              {isExpanded && (
                <div className="pb-3">
                  {section.lessons.map((lesson: SharedLesson) => {
                    const isCurrent = lesson.id === currentLessonId;

                    return (
                      <button
                        key={lesson.id}
                        onClick={() => onLessonClick(lesson.id)}
                        className={`w-full flex items-center gap-3 px-5 py-2.5 pl-12 text-left transition-colors ${
                          isCurrent
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                            : 'hover:bg-hover text-secondary hover:text-primary'
                        }`}
                      >
                        <Circle
                          className={`w-5 h-5 flex-shrink-0 ${
                            isCurrent
                              ? 'text-primary-600 fill-primary-600'
                              : 'text-muted'
                          }`}
                        />
                        <span className="text-base truncate">
                          {lesson.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
