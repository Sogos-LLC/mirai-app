'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMachine } from '@xstate/react';
import { fromPromise } from 'xstate';
import {
  Sparkles,
  Check,
  RotateCcw,
  Loader2,
  ArrowRight,
  AlertCircle,
  BookOpen,
  Globe,
  Lock,
} from 'lucide-react';
import { StepDataRenderer } from '@/components/course/StepDataRenderer';
import { KnowledgeSelectionModal } from '@/components/course/KnowledgeSelectionModal';
import { GapAssignmentModal } from '@/components/course/GapAssignmentModal';
import { PageShell } from '@/components/layout/PageShell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

import {
  courseCreationMachine,
  getWorkflowStepLabel,
  getWorkflowStepNumber,
  TOTAL_WORKFLOW_STEPS,
} from '@/machines/courseCreationMachine';
import {
  useStartCourseCreation,
  useApproveWorkflowStep,
  useRejectWorkflowStep,
  useWorkflowState,
} from '@/hooks/useCourseCreation';
import { useCreateCourse, useGetCourse } from '@/hooks/useCourses';
import { useActiveCourseCreation } from '@/hooks/useActiveCourseCreation';
import {
  GenerationJobStatus,
  WorkflowStepType,
} from '@/gen/mirai/v1/ai_generation_types_pb';

export default function CourseWizardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeCourseId = searchParams.get('courseId');

  // Form state — 3 fields matching the new 5-step design
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [useContext, setUseContext] = useState('');
  const [enableWebResearch, setEnableWebResearch] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Resume flow: load course data from URL param to pre-fill form
  const { data: resumeCourse } = useGetCourse(resumeCourseId ?? undefined);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- only pre-fill on initial course load
  useEffect(() => {
    if (resumeCourse?.settings?.title && !topic) {
      setTopic(resumeCourse.settings.title);
    }
  }, [resumeCourse]);

  // Connect-Query mutations
  const createCourse = useCreateCourse();
  const startCreation = useStartCourseCreation();
  const approveStep = useApproveWorkflowStep();
  const rejectStep = useRejectWorkflowStep();

  // Rejection feedback
  const [feedback, setFeedback] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  // Knowledge selection
  const [enableInternalKnowledge, setEnableInternalKnowledge] = useState(false);
  const [strictKnowledgeOnly, setStrictKnowledgeOnly] = useState(false);
  const [selectedTeamDocIds, setSelectedTeamDocIds] = useState<string[]>([]);
  const [selectedGlobalDocIds, setSelectedGlobalDocIds] = useState<string[]>([]);
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const [showGapAssignment, setShowGapAssignment] = useState(false);
  const [gapDescriptions, setGapDescriptions] = useState<string[]>([]);
  const totalSelectedDocs = selectedTeamDocIds.length + selectedGlobalDocIds.length;

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

  // Poll Temporal workflow state
  const { state: workflowState } = useWorkflowState(state.context.jobId, isActive);

  // Bridge polling state to XState machine
  useEffect(() => {
    if (!workflowState) return;
    send({ type: 'STATE_UPDATE', state: workflowState });
  }, [workflowState, send]);

  const isProcessing = state.matches('processing');
  const isAwaitingApproval = state.matches('awaitingApproval');
  const isSendingSignal = state.matches('sendingApproval') || state.matches('sendingRejection');

  // ALL 5 steps show approval UI
  const showStepReview = isAwaitingApproval || isSendingSignal;
  const showProcessing = isProcessing;

  // Start the workflow: create a course record, then start the Temporal workflow
  const handleStart = useCallback(async () => {
    const topicVal = topic.trim();
    const audienceVal = audience.trim();
    if (!topicVal || !audienceVal) return;

    setIsStarting(true);
    setStartError(null);

    try {
      // 1. Reuse existing course if resuming, otherwise create new
      let courseId = resumeCourseId ?? undefined;
      if (!courseId) {
        const courseResult = await createCourse.mutate({
          settings: { title: topicVal },
        });
        courseId = courseResult.course?.id;
        if (!courseId) throw new Error('Failed to create course');
      }

      // 2. Start the unified AI workflow
      const result = await startCreation.mutate({
        courseId,
        topic: topicVal,
        audience: audienceVal,
        useContext: useContext.trim() || undefined,
        enableInternalKnowledge,
        selectedTeamDocIds: selectedTeamDocIds.length > 0 ? selectedTeamDocIds : undefined,
        selectedGlobalDocIds: selectedGlobalDocIds.length > 0 ? selectedGlobalDocIds : undefined,
        enableWebResearch,
        strictKnowledgeOnly: enableInternalKnowledge && strictKnowledgeOnly,
      });

      if (result.job?.id) {
        send({
          type: 'WORKFLOW_STARTED',
          jobId: result.job.id,
          courseId,
        });
        // Clean up resume URL param
        if (resumeCourseId) {
          router.replace('/course/wizard', { scroll: false });
        }
      }
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start course creation');
    } finally {
      setIsStarting(false);
    }
  }, [topic, audience, useContext, enableInternalKnowledge, strictKnowledgeOnly, selectedTeamDocIds, selectedGlobalDocIds, enableWebResearch, resumeCourseId, createCourse, startCreation, send, router]);

  // Approve current step
  const handleApprove = useCallback(() => {
    setShowRejectForm(false);
    setFeedback('');
    send({ type: 'APPROVE' });
  }, [send]);

  // Reject current step with feedback
  const handleReject = useCallback(() => {
    if (!feedback.trim()) return;
    setShowRejectForm(false);
    send({ type: 'REJECT', feedback: feedback.trim() });
    setFeedback('');
  }, [feedback, send]);

  // Open gap assignment modal
  const handleAssignGaps = useCallback((gaps: string[]) => {
    setGapDescriptions(gaps);
    setShowGapAssignment(true);
  }, []);

  // Defer workflow: fire-and-forget reject + redirect immediately
  const handleDefer = useCallback(() => {
    setShowGapAssignment(false);
    // Fire-and-forget: reject the workflow directly, don't wait for XState
    rejectStep.mutate({
      jobId: state.context.jobId!,
      step: state.context.pendingStep!,
      feedback: '__DEFERRED__',
    });
    // Redirect immediately — user doesn't need to watch the spinner
    router.push('/dashboard?gaps_assigned=true');
  }, [rejectStep, state.context, router]);

  // Step-specific labels for approval UI
  const pendingStep = state.context.pendingStep;
  const stepLabel = pendingStep ? getWorkflowStepLabel(pendingStep) : '';
  const stepNumber = pendingStep ? getWorkflowStepNumber(pendingStep) : 0;

  // Approve button label varies by step
  const getApproveLabel = () => {
    if (!pendingStep) return 'Approve';
    switch (pendingStep) {
      case WorkflowStepType.INTENT_ANALYSIS:
        return 'Approve Analysis';
      case WorkflowStepType.DEFINE_SUCCESS:
        return 'Approve Outcomes';
      case WorkflowStepType.APPROVE_STRUCTURE:
        return 'Approve Structure';
      case WorkflowStepType.SAMPLE_LESSON:
        return 'Approve Lesson';
      case WorkflowStepType.FINAL_REVIEW:
        return 'Approve & Export';
      default:
        return 'Approve';
    }
  };

  return (
    <PageShell
      title="Create New Course"
      description="AI-powered instructional design wizard"
      backButton={{ label: 'Back to Dashboard', onClick: () => router.push('/dashboard') }}
      maxWidth="5xl"
    >
      <Card
        data-wizard-state={
          isIdle ? 'idle'
            : isCompleted ? 'completed'
            : isFailed ? 'failed'
            : isAwaitingApproval ? 'awaiting-approval'
            : isSendingSignal ? 'sending-signal'
            : 'processing'
        }
        data-wizard-step={pendingStep ? getWorkflowStepLabel(pendingStep).toLowerCase().replace(/\s+/g, '-') : ''}
        data-wizard-progress={state.context.progressPercent}
      >
        {/* ===================== IDLE STATE ===================== */}
        {isIdle && (
          <>
            <CardContent>
              <div className="max-w-2xl mx-auto">
                {/* Resume banner */}
                {resumeCourseId && resumeCourse && (
                  <div className="mb-6 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      Resuming course creation
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                      Knowledge gaps have been addressed. Generate again with enriched sources.
                    </p>
                  </div>
                )}

                {/* Hero icon + heading */}
                <div className="flex flex-col items-center text-center mb-8">
                  <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
                    <Sparkles className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-primary mb-2">
                    What would you like to teach?
                  </h2>
                  <p className="text-sm text-secondary max-w-lg">
                    Describe your course topic and target audience. AI will design a complete
                    instructional program through a 5-step validation process.
                  </p>
                </div>

                {/* Topic */}
                <div className="mb-5">
                  <label htmlFor="topic" className="block text-sm font-semibold text-primary mb-1.5">
                    Course Topic
                  </label>
                  <input
                    id="topic"
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Introduction to Machine Learning, Leadership Skills for Managers"
                    className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                {/* Audience */}
                <div className="mb-5">
                  <label htmlFor="audience" className="block text-sm font-semibold text-primary mb-1.5">
                    Target Audience
                  </label>
                  <input
                    id="audience"
                    type="text"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="e.g., Junior developers with 1-2 years experience, New managers transitioning from IC roles"
                    className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                {/* Use Context (optional) */}
                <div>
                  <label
                    htmlFor="useContext"
                    className="block text-sm font-semibold text-primary mb-1.5"
                  >
                    Additional Context
                    <span className="text-muted font-normal ml-1">(optional)</span>
                  </label>
                  <textarea
                    id="useContext"
                    value={useContext}
                    onChange={(e) => setUseContext(e.target.value)}
                    placeholder="Describe how the course will be used: delivery format (self-paced, instructor-led), time constraints, prerequisites, or any specific requirements..."
                    rows={3}
                    className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  />
                </div>

                {/* Data Source Toggles */}
                <div className="mt-5 space-y-3">
                  {/* Internal Knowledge Toggle */}
                  <div>
                    <label
                      htmlFor="internalKnowledge"
                      className="flex items-center gap-3 cursor-pointer select-none"
                    >
                      <div className="relative">
                        <input
                          id="internalKnowledge"
                          type="checkbox"
                          checked={enableInternalKnowledge}
                          onChange={(e) => {
                            setEnableInternalKnowledge(e.target.checked);
                            if (!e.target.checked) setStrictKnowledgeOnly(false);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-page border rounded-full peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-colors" />
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-secondary" />
                        <span className="text-sm font-medium text-primary">
                          Internal Knowledge
                        </span>
                        <span className="text-xs text-muted">
                          — ground content in your documents
                        </span>
                      </div>
                    </label>

                    {enableInternalKnowledge && (
                      <div className="ml-12 mt-2 space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowKnowledgeModal(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-secondary bg-surface border rounded-lg hover:bg-hover transition-colors min-h-[32px]"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          {totalSelectedDocs > 0
                            ? `${totalSelectedDocs} source${totalSelectedDocs === 1 ? '' : 's'} selected`
                            : 'Select Knowledge Sources'}
                          {totalSelectedDocs > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
                              {totalSelectedDocs}
                            </span>
                          )}
                        </button>

                        {totalSelectedDocs > 0 && (
                          <label
                            htmlFor="strictKnowledge"
                            className="flex items-center gap-3 cursor-pointer select-none"
                          >
                            <div className="relative">
                              <input
                                id="strictKnowledge"
                                type="checkbox"
                                checked={strictKnowledgeOnly}
                                onChange={(e) => setStrictKnowledgeOnly(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-page border rounded-full peer-checked:bg-amber-600 peer-checked:border-amber-600 transition-colors" />
                              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              <span className="text-xs font-medium text-primary">
                                Strict mode
                              </span>
                              <span className="text-[10px] text-muted">
                                — only use internal knowledge
                              </span>
                            </div>
                          </label>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Web Research Toggle */}
                  <label
                    htmlFor="webResearch"
                    className="flex items-center gap-3 cursor-pointer select-none"
                  >
                    <div className="relative">
                      <input
                        id="webResearch"
                        type="checkbox"
                        checked={enableWebResearch}
                        onChange={(e) => setEnableWebResearch(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-page border rounded-full peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-colors" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-secondary" />
                      <span className="text-sm font-medium text-primary">
                        Web Research
                      </span>
                      <span className="text-xs text-muted">
                        — enrich analysis with live web data
                      </span>
                    </div>
                  </label>
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
                disabled={!topic.trim() || !audience.trim() || isStarting}
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
                {state.context.progressPercent}% complete
              </p>
            </div>
          </CardContent>
        )}

        {/* ============ STEP REVIEW (all 5 steps) ============ */}
        {showStepReview && (
          <>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle as="h3">
                  Step {stepNumber}: {stepLabel}
                </CardTitle>
                <span className="text-xs text-muted">
                  {stepNumber} of {TOTAL_WORKFLOW_STEPS}
                </span>
              </div>
              {/* Step progress bar */}
              <div className="w-full h-1 bg-page rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                  style={{ width: `${(stepNumber / TOTAL_WORKFLOW_STEPS) * 100}%` }}
                />
              </div>
            </CardHeader>

            {state.context.stepData && state.context.pendingStep && (
              <CardContent className="max-h-[60vh] overflow-y-auto">
                <StepDataRenderer
                  step={state.context.pendingStep}
                  data={state.context.stepData}
                  onAssignGaps={state.context.pendingStep === WorkflowStepType.INTENT_ANALYSIS ? handleAssignGaps : undefined}
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
                    {getApproveLabel()}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder={`What should be different about the ${stepLabel.toLowerCase()}?`}
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
                      Regenerate {stepLabel}
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
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() => router.push('/dashboard')}
                >
                  Back to Dashboard
                </Button>
                <Button
                  variant="primary"
                  onClick={() => send({ type: 'RESET' })}
                  className="gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try Again
                </Button>
              </div>
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
          selectedTeamDocIds={selectedTeamDocIds}
          selectedGlobalDocIds={selectedGlobalDocIds}
          onConfirm={(teamIds, globalIds) => {
            setSelectedTeamDocIds(teamIds);
            setSelectedGlobalDocIds(globalIds);
            setShowKnowledgeModal(false);
          }}
          onClose={() => setShowKnowledgeModal(false)}
        />
      )}

      {/* Gap assignment modal */}
      {showGapAssignment && state.context.courseId && (
        <GapAssignmentModal
          courseId={state.context.courseId}
          gaps={gapDescriptions}
          onClose={() => setShowGapAssignment(false)}
          onDefer={handleDefer}
        />
      )}
    </PageShell>
  );
}
