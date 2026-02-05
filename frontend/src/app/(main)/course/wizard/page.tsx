'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMachine } from '@xstate/react';
import { fromPromise } from 'xstate';
import { ArrowLeft, Sparkles, Check, RotateCcw, Loader2 } from 'lucide-react';
import { StepDataRenderer } from '@/components/course/StepDataRenderer';

import {
  courseCreationMachine,
  getWorkflowStepLabel,
} from '@/machines/courseCreationMachine';
import {
  useStartCourseCreation,
  useApproveWorkflowStep,
  useRejectWorkflowStep,
  useWorkflowState,
} from '@/hooks/useCourseCreation';
import { useCreateCourse } from '@/hooks/useCourses';
import { useActiveCourseCreation } from '@/hooks/useActiveCourseCreation';
import { GenerationJobStatus } from '@/gen/mirai/v1/ai_generation_types_pb';
import dynamic from 'next/dynamic';

const WorkflowVisualization = dynamic(
  () => import('@/components/course/WorkflowVisualization'),
  { ssr: false }
);

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

  // Selection state for persona/tone steps
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
  }, [courseName, desiredOutcomes, createCourse, startCreation, send]);

  // Approve current step
  const handleApprove = useCallback(() => {
    setShowRejectForm(false);
    setFeedback('');
    send({ type: 'APPROVE', selectedIds: selectedIds.length > 0 ? selectedIds : undefined });
    setSelectedIds([]);
  }, [send, selectedIds]);

  // Reject current step
  const handleReject = useCallback(() => {
    if (!feedback.trim()) return;
    setShowRejectForm(false);
    send({ type: 'REJECT', feedback: feedback.trim() });
    setFeedback('');
  }, [feedback, send]);

  const isProcessing = state.matches('processing');
  const isAwaitingApproval = state.matches('awaitingApproval');
  const isSendingSignal = state.matches('sendingApproval') || state.matches('sendingRejection');

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-secondary hover:text-primary transition-colors mb-4 min-h-[44px] -ml-2 px-2"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-base">Back to Dashboard</span>
        </button>
        <h1 className="text-2xl md:text-3xl font-bold text-primary">Create New Course</h1>
        <p className="text-secondary mt-2">
          AI-guided course creation with step-by-step review
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
        {/* Left column: Always show workflow visualization */}
        <div className="lg:col-span-2">
          <WorkflowVisualization
            jobId={state.context.jobId}
            pendingStep={state.context.pendingStep}
            progressPercent={state.context.progressPercent}
            progressMessage={state.context.progressMessage}
            isActive={isActive}
          />
        </div>

        {/* Right column: Controls & Step Data */}
        <div className="space-y-4">
          {/* Start Form */}
          {isIdle && (
            <div className="bg-surface border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <h3 className="text-sm font-medium text-primary">Start Course Creation</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-secondary mb-1">Course Name</label>
                  <input
                    type="text"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="e.g. Introduction to Machine Learning"
                    className="w-full px-3 py-2 bg-page border rounded-lg text-primary text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && courseName.trim()) handleStart();
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm text-secondary mb-1">
                    Desired Outcomes <span className="text-muted">(optional)</span>
                  </label>
                  <textarea
                    value={desiredOutcomes}
                    onChange={(e) => setDesiredOutcomes(e.target.value)}
                    placeholder="What should students learn?"
                    rows={3}
                    className="w-full px-3 py-2 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  />
                </div>

                <button
                  onClick={handleStart}
                  disabled={!courseName.trim() || isStarting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm font-medium transition-colors min-h-[44px]"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Start AI Course Creation
                    </>
                  )}
                </button>

                {startError && (
                  <p className="text-xs text-red-500">{startError}</p>
                )}
              </div>
            </div>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <div className="bg-surface border rounded-xl p-6">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                <div>
                  <h3 className="text-sm font-medium text-primary">AI is generating...</h3>
                  <p className="text-xs text-secondary mt-0.5">
                    {state.context.progressMessage || 'Working on the next step'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step Review Panel */}
          {isAwaitingApproval && state.context.pendingStep && (
            <div className="bg-surface border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b bg-indigo-50 dark:bg-indigo-950/30">
                <h3 className="text-sm font-medium text-primary">
                  Review: {getWorkflowStepLabel(state.context.pendingStep)}
                </h3>
              </div>

              {/* Step data preview */}
              {state.context.stepData && (
                <div className="px-4 py-3 border-b max-h-[60vh] overflow-y-auto">
                  <StepDataRenderer
                    step={state.context.pendingStep!}
                    data={state.context.stepData}
                    onSelectionChange={setSelectedIds}
                  />
                </div>
              )}

              {/* Approve/Reject actions */}
              <div className="px-4 py-3 space-y-3">
                {!showRejectForm ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleApprove}
                      disabled={isSendingSignal}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-sm font-medium transition-colors min-h-[44px]"
                    >
                      <Check className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => setShowRejectForm(true)}
                      disabled={isSendingSignal}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-surface border hover:bg-hover text-primary rounded-lg text-sm font-medium transition-colors min-h-[44px]"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Regenerate
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="What should be different?"
                      rows={2}
                      className="w-full px-3 py-2 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleReject}
                        disabled={!feedback.trim() || isSendingSignal}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white rounded-lg text-sm font-medium transition-colors min-h-[44px]"
                      >
                        {isSendingSignal ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        Regenerate
                      </button>
                      <button
                        onClick={() => {
                          setShowRejectForm(false);
                          setFeedback('');
                        }}
                        className="px-3 py-2 text-secondary hover:text-primary text-sm min-h-[44px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sending signal indicator */}
          {isSendingSignal && (
            <div className="bg-surface border rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                <span className="text-sm text-secondary">Sending response...</span>
              </div>
            </div>
          )}

          {/* Completed */}
          {isCompleted && (
            <div className="bg-surface border border-green-200 dark:border-green-800 rounded-xl p-6 text-center">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-sm font-medium text-primary mb-1">Course Created</h3>
              <p className="text-xs text-secondary mb-4">
                Your course has been generated successfully.
              </p>
              {state.context.courseId && (
                <button
                  onClick={() => router.push(`/course/${state.context.courseId}/editor`)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors min-h-[44px]"
                >
                  Open in Editor
                </button>
              )}
            </div>
          )}

          {/* Failed */}
          {isFailed && (
            <div className="bg-surface border border-red-200 dark:border-red-800 rounded-xl p-6">
              <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                Workflow Failed
              </h3>
              <p className="text-xs text-secondary">
                {state.context.error ?? 'An unexpected error occurred'}
              </p>
            </div>
          )}

          {/* Error toast */}
          {state.context.error && !isFailed && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs text-red-600 dark:text-red-400">
                {state.context.error}
              </p>
              <button
                onClick={() => send({ type: 'DISMISS_ERROR' })}
                className="text-xs text-red-500 hover:text-red-600 mt-1 underline"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
