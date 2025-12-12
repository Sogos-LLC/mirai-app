'use client';

import React, { useMemo, useEffect, useState } from 'react';
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
  CheckCircle2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import {
  outlineReviewMachine,
  isLoading,
  isSuccess,
  isPollingOutline,
} from '@/machines/outlineReviewMachine';
import {
  useApproveCourseOutline,
  useGenerateAllLessons,
  useGenerateCourseOutline,
} from '@/hooks/useAIGeneration';
import {
  getJob as getJobClient,
  getCourseOutline as getCourseOutlineClient,
} from '@/lib/aiGenerationClient';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useIsTouchDevice } from '@/hooks/useBreakpoint';

// Inline edit state type
interface EditState {
  type: 'section' | 'lesson';
  sectionIndex: number;
  lessonIndex?: number;
  title: string;
  description?: string;
}

export default function OutlineReviewPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;
  const isTouch = useIsTouchDevice();

  // DEBUG: Track courseID through the system
  console.log('[DEBUG-COURSEID] OutlinePage: courseId from URL params:', courseId);

  // Inline editing state
  const [editState, setEditState] = useState<EditState | null>(null);

  // API hooks
  const approveCourseOutline = useApproveCourseOutline();
  const generateAllLessons = useGenerateAllLessons();
  const generateCourseOutline = useGenerateCourseOutline();

  // Create machine with provided actors
  const machineWithActors = useMemo(() => {
    return outlineReviewMachine.provide({
      actors: {
        loadOutlineActor: fromPromise(async ({ input }: { input: { courseId: string } }) => {
          // DEBUG: Track courseID through the system
          console.log('[DEBUG-COURSEID] OutlinePage loadOutlineActor: loading outline for courseId:', input.courseId);
          try {
            // Try to get the outline
            const outline = await getCourseOutlineClient(input.courseId);
            if (outline) {
              // DEBUG: Track courseID through the system
              console.log('[DEBUG-COURSEID] OutlinePage loadOutlineActor: outline loaded', {
                outlineId: outline.id,
                outlineCourseId: outline.courseId,
                inputCourseId: input.courseId,
                match: outline.courseId === input.courseId,
              });
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
            // DEBUG: Track courseID through the system
            console.log('[DEBUG-COURSEID] OutlinePage generateLessonsActor: calling generateAllLessons with courseId:', input.courseId);
            const result = await generateAllLessons.mutate(input.courseId);
            console.log('[DEBUG-COURSEID] OutlinePage generateLessonsActor: job created', {
              jobId: result.job?.id,
              courseId: input.courseId,
            });
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

  // Success state - celebration with OK button
  if (isSuccess(stateValue)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-primary mb-2">
              Awesome! Your course is being created
            </h2>
            <p className="text-secondary mb-6">
              We&apos;re generating {totalLessons} lessons based on your outline.
              This typically takes 5-7 minutes.
            </p>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-6">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>You&apos;ll be notified</strong> when your course is ready.
                Check the bell icon or your email.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={() => send({ type: 'DISMISS_SUCCESS' })}
              className="min-w-[200px]"
            >
              Got it!
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
        <div className="max-w-4xl mx-auto px-4 sm:px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 text-secondary hover:text-primary transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-4 py-6 sm:py-8">
        <Card>
          <CardContent className="py-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-primary">
                    Review Your Course Outline
                  </h1>
                  <p className="text-sm sm:text-base text-secondary">
                    {context.outline?.sections?.length ?? 0} sections • {totalLessons} lessons
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => send({ type: 'REGENERATE_OUTLINE' })}
                disabled={loading}
                className="w-full sm:w-auto min-h-[44px]"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
            </div>

            {/* Outline */}
            {context.outline ? (
              <div className="border rounded-lg divide-y mb-6">
                {context.outline.sections?.map((section, sectionIndex) => {
                  const isEditingSection = editState?.type === 'section' && editState.sectionIndex === sectionIndex;

                  return (
                    <div key={sectionIndex} className="bg-surface">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleSection(sectionIndex)}
                          className="flex-shrink-0 p-3 hover:bg-hover transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          {expandedSections.has(sectionIndex) ? (
                            <ChevronDown className="w-5 h-5 text-muted" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted" />
                          )}
                        </button>

                        {isEditingSection ? (
                          <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 py-2 pr-2 sm:pr-4">
                            <input
                              type="text"
                              value={editState.title}
                              onChange={(e) => setEditState({ ...editState, title: e.target.value })}
                              className="flex-1 px-3 py-2 text-sm font-semibold border rounded bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  send({ type: 'UPDATE_SECTION_TITLE', sectionIndex, title: editState.title });
                                  setEditState(null);
                                } else if (e.key === 'Escape') {
                                  setEditState(null);
                                }
                              }}
                            />
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => {
                                  send({ type: 'UPDATE_SECTION_TITLE', sectionIndex, title: editState.title });
                                  setEditState(null);
                                }}
                                className="flex-1 sm:flex-none p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                              >
                                <Check className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => setEditState(null)}
                                className="flex-1 sm:flex-none p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="flex-1 py-3 pr-4 cursor-pointer group min-h-[44px] flex flex-col justify-center"
                            onClick={() => setEditState({
                              type: 'section',
                              sectionIndex,
                              title: section.title || `Section ${sectionIndex + 1}`,
                            })}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-muted">
                                Section {sectionIndex + 1}
                              </span>
                              <span className="text-xs text-muted">
                                ({section.lessons?.length ?? 0} lessons)
                              </span>
                              <Pencil className={`w-3 h-3 text-muted transition-opacity ${isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'}`} />
                            </div>
                            <h3 className="font-semibold text-primary">
                              {section.title || `Section ${sectionIndex + 1}`}
                            </h3>
                          </div>
                        )}
                      </div>

                      {expandedSections.has(sectionIndex) && section.lessons && (
                        <div className="px-2 sm:px-4 pb-3">
                          <div className="ml-4 sm:ml-8 space-y-2">
                            {section.lessons.map((lesson, lessonIndex) => {
                              const isEditingLesson = editState?.type === 'lesson' &&
                                editState.sectionIndex === sectionIndex &&
                                editState.lessonIndex === lessonIndex;

                              return (
                                <div key={lessonIndex}>
                                  {isEditingLesson ? (
                                    <div className="p-3 border rounded bg-surface space-y-3">
                                      <input
                                        type="text"
                                        value={editState.title}
                                        onChange={(e) => setEditState({ ...editState, title: e.target.value })}
                                        className="w-full px-3 py-2 text-sm font-medium border rounded bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                                        placeholder="Lesson title"
                                        autoFocus
                                      />
                                      <textarea
                                        value={editState.description || ''}
                                        onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                                        className="w-full px-3 py-2 text-sm border rounded bg-surface text-secondary focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y min-h-[80px]"
                                        placeholder="Lesson description (optional)"
                                        rows={3}
                                      />
                                      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                                        <button
                                          onClick={() => setEditState(null)}
                                          className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-sm text-secondary hover:bg-hover rounded"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => {
                                            send({
                                              type: 'UPDATE_LESSON',
                                              sectionIndex,
                                              lessonIndex,
                                              title: editState.title,
                                              description: editState.description || '',
                                            });
                                            setEditState(null);
                                          }}
                                          className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                        >
                                          Save
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      className="flex items-start gap-3 p-2 rounded hover:bg-hover cursor-pointer group min-h-[44px]"
                                      onClick={() => setEditState({
                                        type: 'lesson',
                                        sectionIndex,
                                        lessonIndex,
                                        title: lesson.title || `Lesson ${lessonIndex + 1}`,
                                        description: lesson.description || '',
                                      })}
                                    >
                                      <BookOpen className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <p className="text-sm font-medium text-primary">
                                            {lesson.title || `Lesson ${lessonIndex + 1}`}
                                          </p>
                                          <Pencil className={`w-3 h-3 text-muted transition-opacity ${isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'}`} />
                                        </div>
                                        {lesson.description && (
                                          <p className="text-xs text-secondary line-clamp-2">
                                            {lesson.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-secondary">No outline available.</p>
              </div>
            )}

            {/* Info box */}
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-6">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>Ready to generate your course?</strong> Click &quot;Generate
                Lessons&quot; to start creating lesson content. This process runs in the background
                and you&apos;ll be notified when complete.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
                className="w-full sm:w-auto min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => send({ type: 'APPROVE_OUTLINE' })}
                disabled={loading || !context.outline}
                className="w-full sm:w-auto min-h-[44px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Generate Lessons'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
