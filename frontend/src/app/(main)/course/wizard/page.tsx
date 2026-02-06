'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMachine } from '@xstate/react';
import { fromPromise } from 'xstate';
import {
  Sparkles,
  Check,
  RotateCcw,
  Loader2,
  ArrowRight,
  AlertCircle,
  Paperclip,
} from 'lucide-react';
import { StepDataRenderer } from '@/components/course/StepDataRenderer';
import { KnowledgeSelectionModal } from '@/components/course/KnowledgeSelectionModal';
import { PageShell } from '@/components/layout/PageShell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

import {
  courseCreationMachine,
} from '@/machines/courseCreationMachine';
import {
  useStartCourseCreation,
  useApproveWorkflowStep,
  useRejectWorkflowStep,
  useWorkflowState,
} from '@/hooks/useCourseCreation';
import { useCreateCourse } from '@/hooks/useCourses';
import { useActiveCourseCreation } from '@/hooks/useActiveCourseCreation';
import {
  GenerationJobStatus,
  WorkflowStepType,
} from '@/gen/mirai/v1/ai_generation_types_pb';

export default function CourseWizardPage() {
  const router = useRouter();

  // Form state
  const [courseName, setCourseName] = useState('');
  const [desiredOutcomes, setDesiredOutcomes] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Connect-Query mutations
  const createCourse = useCreateCourse();
  const startCreation = useStartCourseCreation();
  const approveStep = useApproveWorkflowStep();
  const rejectStep = useRejectWorkflowStep();

  // Rejection feedback
  const [feedback, setFeedback] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  // Knowledge selection
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>([]);
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);

  // XState machine with real actor implementations
  const [state, send] = useMachine(
    courseCreationMachine.provide({
      actors: {
        approveStepActor: fromPromise(async ({ input }) => {
          await approveStep.mutate({
            jobId: input.jobId,
            step: input.step,
            selectedIds: input.selectedIds,
            modifications: input.modifications,
          });
        }),
        rejectStepActor: fromPromise(async ({ input }) => {
          await rejectStep.mutate({
            jobId: input.jobId,
            step: input.step,
            feedback: input.feedback,
          });
        }),
      },
    })
  );

  // Check for active workflow to resume
  const { activeJob } = useActiveCourseCreation();

  // Resume active workflow on mount
  useEffect(() => {
    if (!activeJob || !state.matches('idle')) return;

    const courseId = activeJob.courseId;
    if (!courseId) return;

    send({
      type: 'RESUME',
      jobId: activeJob.id,
      courseId,
      status: activeJob.status as GenerationJobStatus,
    });
  }, [activeJob, state, send]);

  // Derive active state for polling
  const isIdle = state.matches('idle');
  const isCompleted = state.matches('completed');
  const isFailed = state.matches('failed');
  const isActive = !isIdle && !isCompleted && !isFailed;

  // Poll Temporal workflow state (replaces SSE stream)
  const { state: workflowState } = useWorkflowState(state.context.jobId, isActive);

  // Bridge polling state to XState machine
  useEffect(() => {
    if (!workflowState) return;
    send({ type: 'STATE_UPDATE', state: workflowState });
  }, [workflowState, send]);

  const isProcessing = state.matches('processing');
  const isAwaitingApproval = state.matches('awaitingApproval');
  const isSendingSignal = state.matches('sendingApproval') || state.matches('sendingRejection');

  // Only outline step requires manual approval
  const isOutlineReview =
    isAwaitingApproval && state.context.pendingStep === WorkflowStepType.OUTLINE;
  const showStepReview =
    isOutlineReview || (isSendingSignal && state.context.pendingStep === WorkflowStepType.OUTLINE);

  // Everything else shows as processing (including non-outline approval states which shouldn't happen now)
  const showProcessing = isProcessing || (isAwaitingApproval && !isOutlineReview) || (isSendingSignal && !showStepReview);

  // Start the workflow: create a course record, then start the Temporal workflow
  const handleStart = useCallback(async () => {
    const name = courseName.trim();
    if (!name) return;

    setIsStarting(true);
    setStartError(null);

    try {
      // 1. Create a course record in the DB
      const courseResult = await createCourse.mutate({
        settings: { title: name },
      });
      const courseId = courseResult.course?.id;
      if (!courseId) throw new Error('Failed to create course');

      // 2. Start the unified AI workflow
      const result = await startCreation.mutate({
        courseId,
        courseName: name,
        desiredOutcomes: desiredOutcomes.trim() || undefined,
        selectedGlobalDocIds: selectedKnowledgeIds.length > 0 ? selectedKnowledgeIds : undefined,
      });

      if (result.job?.id) {
        send({
          type: 'WORKFLOW_STARTED',
          jobId: result.job.id,
          courseId,
        });
      }
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start course creation');
    } finally {
      setIsStarting(false);
    }
  }, [courseName, desiredOutcomes, selectedKnowledgeIds, createCourse, startCreation, send]);

  // Approve outline
  const handleApprove = useCallback(() => {
    setShowRejectForm(false);
    setFeedback('');
    send({ type: 'APPROVE' });
  }, [send]);

  // Reject outline with feedback
  const handleReject = useCallback(() => {
    if (!feedback.trim()) return;
    setShowRejectForm(false);
    send({ type: 'REJECT', feedback: feedback.trim() });
    setFeedback('');
  }, [feedback, send]);

  return (
    <PageShell
      title="Create New Course"
      description="AI will generate a complete course from your topic"
      backButton={{ label: 'Back to Dashboard', onClick: () => router.push('/dashboard') }}
      maxWidth="5xl"
    >
      <Card>
        {/* ===================== IDLE STATE ===================== */}
        {isIdle && (
          <>
            <CardContent>
              <div className="max-w-2xl mx-auto">
                {/* Hero icon + heading */}
                <div className="flex flex-col items-center text-center mb-8">
                  <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
                    <Sparkles className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-primary mb-2">
                    What would you like to teach?
                  </h2>
                  <p className="text-sm text-secondary max-w-lg">
                    Enter a course name and AI will handle the rest &mdash; generating titles,
                    outcomes, personas, and an outline for your review.
                  </p>
                </div>

                {/* Course Name */}
                <div className="mb-6">
                  <input
                    id="courseName"
                    type="text"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="e.g., Introduction to Machine Learning, Leadership Skills for Managers"
                    className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && courseName.trim()) handleStart();
                    }}
                  />
                  <p className="mt-2 text-xs text-muted text-center">
                    Don&apos;t worry about getting it perfect &mdash; AI will refine it.
                  </p>
                </div>

                {/* Desired Outcomes */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="outcomes"
                      className="text-sm font-semibold text-primary"
                    >
                      Desired Course Outcomes
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowKnowledgeModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-secondary bg-surface border rounded-full hover:bg-hover transition-colors min-h-[32px]"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      Add Knowledge
                      {selectedKnowledgeIds.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
                          {selectedKnowledgeIds.length}
                        </span>
                      )}
                    </button>
                  </div>
                  <textarea
                    id="outcomes"
                    value={desiredOutcomes}
                    onChange={(e) => setDesiredOutcomes(e.target.value)}
                    placeholder={
                      '\u2022 Learners will be able to identify key concepts...\n\u2022 Learners will understand how to apply...\n\u2022 Learners will demonstrate proficiency in...'
                    }
                    rows={4}
                    className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  />
                  <p className="mt-2 text-xs text-muted text-center">
                    {desiredOutcomes.trim()
                      ? 'These outcomes serve as the north star guiding all content generation.'
                      : 'Optional — AI will generate outcomes automatically.'}
                  </p>
                </div>

                {startError && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {startError}
                  </div>
                )}
              </div>
            </CardContent>

            {/* Footer */}
            <div className="px-4 py-4 sm:px-6 border-t flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/dashboard')}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleStart}
                disabled={!courseName.trim() || isStarting}
                className="gap-2"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    Generate Course
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {/* ===================== PROCESSING STATE ===================== */}
        {showProcessing && (
          <CardContent>
            {/* Thin progress bar */}
            <div className="w-full h-1 bg-page rounded-full mb-8 overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                style={{ width: `${state.context.progressPercent}%` }}
              />
            </div>

            <div className="flex flex-col items-center text-center py-12">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
              <p className="text-sm font-medium text-primary mb-1">
                {state.context.progressMessage || 'Working on your course...'}
              </p>
              <p className="text-xs text-muted">
                {state.context.progressPercent < 45
                  ? 'Generating course foundation — this takes about 2 minutes'
                  : state.context.progressPercent < 55
                    ? 'Building course outline...'
                    : `Generating lessons — ${state.context.progressPercent}% complete`}
              </p>
            </div>
          </CardContent>
        )}

        {/* ============ OUTLINE REVIEW ============ */}
        {showStepReview && (
          <>
            <CardHeader>
              <CardTitle as="h3">
                Review Course Outline
              </CardTitle>
            </CardHeader>

            {state.context.stepData && (
              <CardContent className="max-h-[60vh] overflow-y-auto">
                <StepDataRenderer
                  step={WorkflowStepType.OUTLINE}
                  data={state.context.stepData}
                />
              </CardContent>
            )}

            {/* Action footer */}
            <div className="px-4 py-4 sm:px-6 border-t">
              {!showRejectForm ? (
                <div className="flex items-center justify-between">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowRejectForm(true)}
                    disabled={isSendingSignal}
                    className="gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Regenerate
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleApprove}
                    disabled={isSendingSignal}
                    className="gap-2"
                  >
                    {isSendingSignal ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Approve & Generate Lessons
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="What should be different about the outline?"
                    rows={2}
                    className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowRejectForm(false);
                        setFeedback('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleReject}
                      disabled={!feedback.trim() || isSendingSignal}
                      className="gap-2"
                    >
                      {isSendingSignal ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                      Regenerate Outline
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ===================== COMPLETED STATE ===================== */}
        {isCompleted && (
          <CardContent>
            <div className="flex flex-col items-center text-center py-12">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <Check className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-primary mb-2">
                Course Created!
              </h2>
              <p className="text-sm text-secondary mb-6">
                Your course has been generated successfully.
              </p>
              {state.context.courseId && (
                <Button
                  variant="primary"
                  onClick={() =>
                    router.push(`/course/${state.context.courseId}/editor`)
                  }
                  className="gap-2"
                >
                  Open in Editor
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardContent>
        )}

        {/* ===================== FAILED STATE ===================== */}
        {isFailed && (
          <CardContent>
            <div className="flex flex-col items-center text-center py-12">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-primary mb-2">
                Something went wrong
              </h2>
              <p className="text-sm text-secondary mb-6">
                {state.context.error ?? 'An unexpected error occurred'}
              </p>
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
              >
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Error toast (non-fatal errors during active workflow) */}
      {state.context.error && !isFailed && (
        <div className="mt-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center justify-between">
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.context.error}
          </p>
          <button
            onClick={() => send({ type: 'DISMISS_ERROR' })}
            className="text-sm text-red-500 hover:text-red-600 underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Knowledge selection modal */}
      {showKnowledgeModal && (
        <KnowledgeSelectionModal
          selectedIds={selectedKnowledgeIds}
          onConfirm={(ids) => {
            setSelectedKnowledgeIds(ids);
            setShowKnowledgeModal(false);
          }}
          onClose={() => setShowKnowledgeModal(false)}
        />
      )}
    </PageShell>
  );
}
