'use client';

import React, { useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMachine } from '@xstate/react';
import { fromPromise } from 'xstate';
import {
  ClipboardList,
  RefreshCw,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  outlineReviewMachine,
  isLoading,
  isInLessonJobQueued,
  isPollingOutline,
  isGeneratingLessons,
} from '@/machines/outlineReviewMachine';
import {
  useGetCourseOutline,
  useApproveCourseOutline,
  useGenerateAllLessons,
  useGenerateCourseOutline,
  useGetJob,
} from '@/hooks/useAIGeneration';
import {
  getJob as getJobClient,
  getCourseOutline as getCourseOutlineClient,
} from '@/lib/aiGenerationClient';
import { GenerationQueuedConfirmation } from '@/components/ai-generation/GenerationQueuedConfirmation';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function OutlineReviewPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;

  // API hooks
  const getOutline = useGetCourseOutline(courseId);
  const approveCourseOutline = useApproveCourseOutline();
  const generateAllLessons = useGenerateAllLessons();
  const generateCourseOutline = useGenerateCourseOutline();

  // Create machine with provided actors
  const machineWithActors = useMemo(() => {
    return outlineReviewMachine.provide({
      actors: {
        loadOutlineActor: fromPromise(async ({ input }: { input: { courseId: string } }) => {
          try {
            // Try to get the outline
            const outline = await getCourseOutlineClient(input.courseId);
            if (outline) {
              return { outline, job: null };
            }
          } catch {
            // Outline doesn't exist yet
          }

          // Check if there's an active job for this course
          // For now, return null - the page will show error if no outline
          return { outline: null, job: null };
        }),
        pollJobActor: fromPromise(async ({ input }: { input: { jobId: string } }) => {
          const job = await getJobClient(input.jobId);
          return { job };
        }),
        getOutlineActor: fromPromise(async ({ input }: { input: { courseId: string } }) => {
          const outline = await getCourseOutlineClient(input.courseId);
          if (!outline) {
            throw new Error('Outline not found');
          }
          return { outline };
        }),
        approveOutlineActor: fromPromise(
          async ({ input }: { input: { courseId: string; outlineId: string } }) => {
            const result = await approveCourseOutline.mutate(input.courseId, input.outlineId);
            return { outline: result.outline! };
          }
        ),
        regenerateOutlineActor: fromPromise(
          async ({ input }: { input: { courseId: string } }) => {
            const result = await generateCourseOutline.mutate({
              courseId: input.courseId,
              desiredOutcome: '', // Will use existing course settings
            });
            return { job: result.job! };
          }
        ),
        generateLessonsActor: fromPromise(
          async ({ input }: { input: { courseId: string } }) => {
            const result = await generateAllLessons.mutate(input.courseId);
            return { job: result.job! };
          }
        ),
      },
    });
  }, [approveCourseOutline, generateAllLessons, generateCourseOutline]);

  // Initialize machine with courseId
  const [state, send] = useMachine(machineWithActors, {
    input: { courseId },
  });

  const context = state.context;
  const stateValue = state.value;
  const loading = isLoading(stateValue);

  // Expanded sections for outline display
  const [expandedSections, setExpandedSections] = React.useState<Set<number>>(new Set());

  // Expand all sections when outline loads
  useEffect(() => {
    if (context.outline?.sections) {
      setExpandedSections(new Set(context.outline.sections.map((_, i) => i)));
    }
  }, [context.outline]);

  // Handle completion states
  useEffect(() => {
    if (state.matches('complete')) {
      router.push(`/course/${courseId}/preview`);
    } else if (state.matches('backgroundGeneration')) {
      router.push('/dashboard');
    }
  }, [state, courseId, router]);

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

  const totalLessons = context.outline?.sections?.reduce(
    (acc, section) => acc + (section.lessons?.length ?? 0),
    0
  ) ?? 0;

  // Loading state
  if (state.matches('loading')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-secondary">Loading outline...</p>
        </div>
      </div>
    );
  }

  // Polling outline state
  if (isPollingOutline(stateValue)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-6" />
            <h2 className="text-xl font-bold text-primary mb-2">Generating Outline</h2>
            <p className="text-secondary mb-4">{context.progressMessage}</p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${context.progressPercent}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Lesson job queued - show choice
  if (isInLessonJobQueued(stateValue)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-0">
            <GenerationQueuedConfirmation
              jobId={context.lessonJobId || ''}
              title="Lesson Generation Started!"
              description={`Your ${totalLessons} lessons are being generated. This typically takes a few minutes.`}
              infoTitle="Generation takes a few minutes"
              infoDescription="Each lesson is carefully crafted based on your outline. You can wait here to watch the progress, or continue working and receive a notification when complete."
              waitButtonLabel="Watch Progress"
              navigateButtonLabel="Notify Me When Done"
              onWaitForCompletion={() => send({ type: 'WAIT_FOR_LESSONS' })}
              onNavigateAway={() => send({ type: 'NAVIGATE_AWAY' })}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Generating lessons - show progress
  if (isGeneratingLessons(stateValue)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-6" />
            <h2 className="text-xl font-bold text-primary mb-2">Generating Lessons</h2>
            <p className="text-secondary mb-4">{context.progressMessage}</p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${context.progressPercent}%` }}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => send({ type: 'NAVIGATE_AWAY' })}
            >
              Continue in Background
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (state.matches('error') || context.error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-primary mb-2">Something went wrong</h2>
            <p className="text-secondary mb-6">{context.error?.message || 'An error occurred'}</p>
            <div className="flex gap-4 justify-center">
              <Button variant="secondary" onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </Button>
              {context.error?.retryable && (
                <Button variant="primary" onClick={() => send({ type: 'RETRY' })}>
                  Try Again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main viewing state - show outline
  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <div className="border-b bg-surface sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 text-secondary hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                  <ClipboardList className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-primary">
                    Review Your Course Outline
                  </h1>
                  <p className="text-secondary">
                    {context.outline?.sections?.length ?? 0} sections • {totalLessons} lessons
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => send({ type: 'REGENERATE_OUTLINE' })}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
            </div>

            {/* Outline */}
            {context.outline ? (
              <div className="border rounded-lg divide-y mb-6">
                {context.outline.sections?.map((section, sectionIndex) => (
                  <div key={sectionIndex} className="bg-surface">
                    <button
                      onClick={() => toggleSection(sectionIndex)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-hover transition-colors text-left"
                    >
                      {expandedSections.has(sectionIndex) ? (
                        <ChevronDown className="w-5 h-5 text-muted flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted">
                            Section {sectionIndex + 1}
                          </span>
                          <span className="text-xs text-muted">
                            ({section.lessons?.length ?? 0} lessons)
                          </span>
                        </div>
                        <h3 className="font-semibold text-primary truncate">
                          {section.title || `Section ${sectionIndex + 1}`}
                        </h3>
                      </div>
                    </button>

                    {expandedSections.has(sectionIndex) && section.lessons && (
                      <div className="px-4 pb-3">
                        <div className="ml-8 space-y-2">
                          {section.lessons.map((lesson, lessonIndex) => (
                            <div
                              key={lessonIndex}
                              className="flex items-start gap-3 p-2 rounded hover:bg-hover"
                            >
                              <BookOpen className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-primary">
                                  {lesson.title || `Lesson ${lessonIndex + 1}`}
                                </p>
                                {lesson.description && (
                                  <p className="text-xs text-secondary line-clamp-2">
                                    {lesson.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-secondary">No outline available.</p>
              </div>
            )}

            {/* Info box */}
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-6">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>Ready to generate your course?</strong> Click &quot;Approve &amp; Generate
                Lessons&quot; to start creating lesson content. This process runs in the background
                and you&apos;ll be notified when complete.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-4 justify-end">
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => send({ type: 'APPROVE_OUTLINE' })}
                disabled={loading || !context.outline}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Approve & Generate Lessons'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
