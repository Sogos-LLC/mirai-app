'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMachine } from '@xstate/react';
import { fromPromise } from 'xstate';
import {
  Check,
  RotateCcw,
  Loader2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { StepDataRenderer } from '@/components/course/StepDataRenderer';
import { GapAssignmentModal } from '@/components/course/GapAssignmentModal';
import { GapTaskResumeBanner } from '@/components/course/GapTaskResumeBanner';
import { PageShell } from '@/components/layout/PageShell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { WizardStepper } from '@/components/course/WizardStepper';
import { FunLoadingOverlay } from '@/components/course/FunLoadingOverlay';
import { outcomesMessages, personaMessages, courseCreationMessages } from '@/components/course/loadingMessages';
import { WizardStep1Title } from '@/components/course/wizard/WizardStep1Title';
import { WizardStep2Outcomes } from '@/components/course/wizard/WizardStep2Outcomes';
import { WizardStep3TeacherStudent } from '@/components/course/wizard/WizardStep3TeacherStudent';
import { WizardStep4Context } from '@/components/course/wizard/WizardStep4Context';

import {
  wizardMachine,
  TOTAL_WIZARD_STEPS,
} from '@/machines/wizardMachine';
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
  useResumeWorkflowDeferral,
  useWorkflowState,
} from '@/hooks/useCourseCreation';
import { useCreateCourse } from '@/hooks/useCourses';
import { useGetJob, useGetActiveJobForCourse, useGetDeferredJobForCourse } from '@/hooks/ai-generation/useJobs';
import {
  useGenerateOutcomes,
  useGenerateSMEPersonas,
  useGenerateAudiencePersonas,
  useSaveWizardState,
  useDeleteWizardState,
  buildWizardStepData,
} from '@/hooks/useCourseWizard';
import { useListGapTasksForCourse } from '@/hooks/useKnowledgeGapTasks';
import { useFeatureTogglesStore } from '@/store/zustand/useFeatureTogglesStore';
import { GuidedTour } from '@/components/onboarding/GuidedTour';
import { wizardTourSteps } from '@/components/onboarding/tours/wizardTour';
import { KnowledgeGapTaskStatus } from '@/gen/mirai/v1/knowledge_gap_pb';
import {
  GenerationJobStatus,
  WorkflowStepType,
} from '@/gen/mirai/v1/ai_generation_types_pb';

export default function CourseWizardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeJobId = searchParams.get('jobId') ?? undefined;
  const resumeCourseId = searchParams.get('courseId') ?? undefined;

  const { showQAChecks } = useFeatureTogglesStore();

  // =========================================================================
  // Wizard hooks (Step collection phase)
  // =========================================================================
  const genOutcomes = useGenerateOutcomes();
  const genSMEPersonas = useGenerateSMEPersonas();
  const genAudiencePersonas = useGenerateAudiencePersonas();
  const deleteState = useDeleteWizardState();

  // =========================================================================
  // Wizard XState Machine (simplified 4 steps)
  // =========================================================================
  const [wizardState, wizardSend] = useMachine(
    wizardMachine.provide({
      actors: {
        generateOutcomesActor: fromPromise(async ({ input }) => {
          const result = await genOutcomes.mutate({
            courseName: input.courseTitle,
          });
          return result.outcomes;
        }),
        generatePersonasActor: fromPromise(async ({ input }) => {
          // Generate teacher (SME) and student (audience) in parallel
          const [smeResult, audienceResult] = await Promise.all([
            genSMEPersonas.mutate({
              title: input.courseTitle,
              description: input.outcomes,
            }),
            genAudiencePersonas.mutate({
              title: input.courseTitle,
              description: input.outcomes,
              selectedSmes: [],
            }),
          ]);
          return {
            teacher: smeResult.personas[0],
            student: audienceResult.personas[0],
          };
        }),
      },
    })
  );

  // =========================================================================
  // Workflow hooks (Course generation phase)
  // =========================================================================
  const createCourse = useCreateCourse();
  const startCreation = useStartCourseCreation();
  const approveStep = useApproveWorkflowStep();
  const rejectStep = useRejectWorkflowStep();
  const resumeDeferral = useResumeWorkflowDeferral();

  const [feedback, setFeedback] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showGapAssignment, setShowGapAssignment] = useState(false);
  const [gapDescriptions, setGapDescriptions] = useState<string[]>([]);
  const [pendingModifications, setPendingModifications] = useState<Record<string, string>>({});

  // =========================================================================
  // Workflow XState Machine
  // =========================================================================
  const [workflowMachineState, workflowSend] = useMachine(
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

  // Resume a specific job if jobId is provided via query param
  const { data: resumeJob } = useGetJob(resumeJobId);
  const { data: courseJob } = useGetActiveJobForCourse(resumeCourseId);
  const { data: deferredJob } = useGetDeferredJobForCourse(resumeCourseId);

  // Gap task tracking
  const gapTaskCourseId = resumeCourseId ?? resumeJob?.courseId ?? '';
  const { data: gapTasks, isLoading: isLoadingGapTasks } = useListGapTasksForCourse(gapTaskCourseId);
  const [deferralInfo, setDeferralInfo] = useState<{
    totalTasks: number;
    completedTasks: number;
  } | null>(null);

  useEffect(() => {
    if (!workflowMachineState.matches('idle')) return;
    const job = resumeJob ?? courseJob;
    if (!job) return;
    const courseId = job.courseId;
    if (!courseId) return;
    if (job.status === GenerationJobStatus.DEFERRED) return;

    setPhase('workflow');
    workflowSend({
      type: 'RESUME',
      jobId: job.id,
      courseId,
      status: job.status as GenerationJobStatus,
    });
  }, [resumeJob, courseJob, workflowMachineState, workflowSend]);

  // Resume from deferral
  const [deferralRestored, setDeferralRestored] = useState(false);
  useEffect(() => {
    if (deferralRestored) return;
    const jobToResume = (resumeJob?.status === GenerationJobStatus.DEFERRED ? resumeJob : null) ?? deferredJob;
    if (!jobToResume) return;
    if (courseJob) return;
    const courseId = jobToResume.courseId;
    if (!courseId) return;
    if (isLoadingGapTasks) return;

    const total = gapTasks.length;
    const completed = gapTasks.filter(
      (t) => t.status === KnowledgeGapTaskStatus.COMPLETED
    ).length;
    setDeferralInfo({ totalTasks: total, completedTasks: completed });

    const resumeWorkflow = async () => {
      try {
        await resumeDeferral.mutate(jobToResume.id);
        setPhase('workflow');
        workflowSend({
          type: 'RESUME',
          jobId: jobToResume.id,
          courseId,
          status: GenerationJobStatus.PROCESSING,
        });
      } catch (err) {
        setStartError(err instanceof Error ? err.message : 'Failed to resume workflow');
      }
    };

    setDeferralRestored(true);
    resumeWorkflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredJob, resumeJob, courseJob, isLoadingGapTasks, deferralRestored, gapTasks]);

  // Poll Temporal workflow state
  const wfIsIdle = workflowMachineState.matches('idle');
  const wfIsCompleted = workflowMachineState.matches('completed');
  const wfIsFailed = workflowMachineState.matches('failed');
  const wfIsActive = !wfIsIdle && !wfIsCompleted && !wfIsFailed;

  const { state: temporalState } = useWorkflowState(
    workflowMachineState.context.jobId,
    wfIsActive,
  );

  useEffect(() => {
    if (!temporalState) return;
    workflowSend({ type: 'STATE_UPDATE', state: temporalState });
  }, [temporalState, workflowSend]);

  const isProcessing = workflowMachineState.matches('processing');
  const isAwaitingApproval = workflowMachineState.matches('awaitingApproval');
  const isSendingSignal = workflowMachineState.matches('sendingApproval') || workflowMachineState.matches('sendingRejection');
  const showStepReview = isAwaitingApproval || isSendingSignal;
  const showProcessing = isProcessing;

  // =========================================================================
  // Phase management: wizard → workflow
  // =========================================================================
  const [phase, setPhase] = useState<'wizard' | 'workflow' | 'starting'>('wizard');
  const [startError, setStartError] = useState<string | null>(null);

  // When wizard completes, start the Temporal workflow
  const isWizardCompleted = wizardState.matches('completed');
  useEffect(() => {
    if (!isWizardCompleted || phase !== 'wizard') return;

    const startWorkflow = async () => {
      setPhase('starting');
      setStartError(null);
      setDeferralInfo(null);

      try {
        const ctx = wizardState.context;

        // 1. Create course (auto-assign to personal folder handled by backend)
        let courseId = resumeCourseId;
        if (!courseId) {
          const courseResult = await createCourse.mutate({
            settings: { title: ctx.courseTitle },
          });
          courseId = courseResult.course?.id;
        }
        if (!courseId) throw new Error('Failed to create course');

        // 2. Build the teacher/student persona data for the workflow
        const smePersonas = ctx.teacher ? [ctx.teacher] : [];
        const selectedSmeIds = ctx.teacher ? [ctx.teacher.id] : [];
        const audiencePersonas = ctx.student ? [ctx.student] : [];
        const selectedAudienceIds = ctx.student ? [ctx.student.id] : [];

        // 3. Start Temporal workflow with simplified wizard data
        const result = await startCreation.mutate({
          courseId,
          topic: ctx.courseTitle,
          audience: ctx.student?.role ?? '',
          desiredOutcomes: ctx.outcomes,
          improvedTitle: ctx.courseTitle,
          description: ctx.outcomes,
          smePersonas,
          selectedSmeIds,
          audiencePersonas,
          selectedAudienceIds,
          additionalContext: ctx.contextText,
          skipQa: !showQAChecks,
        });

        if (result.job?.id) {
          deleteState.mutate().catch(() => {});
          setPhase('workflow');
          workflowSend({
            type: 'WORKFLOW_STARTED',
            jobId: result.job.id,
            courseId,
          });
        }
      } catch (err) {
        setStartError(err instanceof Error ? err.message : 'Failed to start course creation');
        setPhase('wizard');
      }
    };

    startWorkflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWizardCompleted]);

  // =========================================================================
  // Wizard state helpers
  // =========================================================================
  const isWizardPhase = phase === 'wizard' || phase === 'starting';
  const isWorkflowPhase = phase === 'workflow';

  const isGenerating = ['generatingOutcomes', 'generatingPersonas'].some((s) => wizardState.matches(s));

  const wizardCtx = wizardState.context;

  const canGoNext = (() => {
    switch (wizardCtx.currentStep) {
      case 1: return wizardCtx.courseTitle.trim().length > 0;
      case 2: return wizardCtx.outcomes.trim().length > 0;
      case 3: return wizardCtx.teacher !== null && wizardCtx.student !== null;
      case 4: return true; // Context is optional
      default: return false;
    }
  })();

  const getLoadingProps = () => {
    if (wizardState.matches('generatingOutcomes')) {
      return { title: 'Generating Outcomes', messages: outcomesMessages };
    }
    if (wizardState.matches('generatingPersonas')) {
      return { title: 'Creating Teacher & Student', messages: personaMessages };
    }
    return { title: 'Working...', messages: ['Please wait...'] };
  };

  // =========================================================================
  // Workflow phase handlers
  // =========================================================================
  const handleApprove = useCallback(() => {
    setShowRejectForm(false);
    setFeedback('');
    workflowSend({
      type: 'APPROVE',
      modifications: Object.keys(pendingModifications).length > 0 ? pendingModifications : undefined,
    });
    setPendingModifications({});
  }, [workflowSend, pendingModifications]);

  const handleReject = useCallback(() => {
    if (!feedback.trim()) return;
    setShowRejectForm(false);
    workflowSend({ type: 'REJECT', feedback: feedback.trim() });
    setFeedback('');
  }, [feedback, workflowSend]);

  const handleAssignGaps = useCallback((gaps: string[]) => {
    setGapDescriptions(gaps);
    setShowGapAssignment(true);
  }, []);

  const saveState = useSaveWizardState();
  const handleDefer = useCallback(async () => {
    setShowGapAssignment(false);
    const stepData = buildWizardStepData({
      courseName: wizardState.context.courseTitle,
      improvedTitle: wizardState.context.courseTitle,
      description: wizardState.context.outcomes,
      desiredOutcomes: wizardState.context.outcomes,
      smePersonas: wizardState.context.teacher ? [wizardState.context.teacher] : [],
      selectedSmeIds: wizardState.context.teacher ? [wizardState.context.teacher.id] : [],
      audiencePersonas: wizardState.context.student ? [wizardState.context.student] : [],
      selectedAudienceIds: wizardState.context.student ? [wizardState.context.student.id] : [],
      toneOptions: [],
      selectedToneId: '',
      additionalContext: wizardState.context.contextText,
      selectedTeamDocIds: [],
      selectedGlobalDocIds: [],
      strictKnowledgeOnly: false,
    });
    saveState.mutate({ currentStep: 'context', data: stepData }).catch(() => {});

    rejectStep.mutate({
      jobId: workflowMachineState.context.jobId!,
      step: workflowMachineState.context.pendingStep!,
      feedback: '__DEFERRED__',
    });
    router.push('/dashboard?gaps_assigned=true');
  }, [rejectStep, workflowMachineState.context, router, wizardState.context, saveState]);

  const pendingStep = workflowMachineState.context.pendingStep;

  useEffect(() => {
    setPendingModifications({});
  }, [pendingStep]);
  const stepLabel = pendingStep ? getWorkflowStepLabel(pendingStep) : '';
  const stepNumber = pendingStep ? getWorkflowStepNumber(pendingStep) : 0;

  const getApproveLabel = () => {
    if (!pendingStep) return 'Approve';
    if (pendingStep === WorkflowStepType.COMBINED_REVIEW) return 'Generate Course';
    return 'Approve';
  };

  // =========================================================================
  // Render
  // =========================================================================
  return (
    <PageShell
      title="Create New Course"
      description="AI builds your course in 4 simple steps"
      backButton={{ label: 'Back to Dashboard', onClick: () => router.push('/dashboard') }}
      maxWidth="6xl"
    >
      {/* ===================== WIZARD PHASE ===================== */}
      {isWizardPhase && (
        <>
          <GuidedTour tourId="wizard" steps={wizardTourSteps} />
          <div data-tour="wizard-stepper">
            <WizardStepper currentPhase={wizardCtx.currentStep} />
          </div>

          <Card>
            <CardContent>
              {isGenerating ? (
                <FunLoadingOverlay {...getLoadingProps()} />
              ) : phase === 'starting' ? (
                <FunLoadingOverlay
                  title="Starting Course Creation"
                  messages={courseCreationMessages}
                />
              ) : (
                <>
                  {/* Gap task resume banner */}
                  {deferralInfo && (
                    <GapTaskResumeBanner
                      totalTasks={deferralInfo.totalTasks}
                      completedTasks={deferralInfo.completedTasks}
                      onDismiss={() => setDeferralInfo(null)}
                    />
                  )}

                  {/* Error banners */}
                  {wizardCtx.error && (
                    <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      <p className="text-sm text-red-600 dark:text-red-400 flex-1">{wizardCtx.error}</p>
                      <button
                        onClick={() => wizardSend({ type: 'DISMISS_ERROR' })}
                        className="text-xs text-red-500 hover:text-red-600 underline ml-2"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                  {startError && (
                    <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      <p className="text-sm text-red-600 dark:text-red-400 flex-1">{startError}</p>
                      <button
                        onClick={() => setStartError(null)}
                        className="text-xs text-red-500 hover:text-red-600 underline ml-2"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* Step content */}
                  <div data-tour="wizard-step-content">
                  {wizardCtx.currentStep === 1 && (
                    <WizardStep1Title context={wizardCtx} send={wizardSend} />
                  )}
                  {wizardCtx.currentStep === 2 && (
                    <WizardStep2Outcomes context={wizardCtx} send={wizardSend} />
                  )}
                  {wizardCtx.currentStep === 3 && (
                    <WizardStep3TeacherStudent context={wizardCtx} send={wizardSend} />
                  )}
                  {wizardCtx.currentStep === 4 && (
                    <WizardStep4Context context={wizardCtx} send={wizardSend} />
                  )}
                  </div>
                </>
              )}
            </CardContent>

            {/* Wizard footer */}
            {!isGenerating && phase !== 'starting' && (
              <div className="px-4 py-4 sm:px-6 border-t flex items-center justify-between">
                <div>
                  {wizardCtx.currentStep === 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push('/dashboard')}
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => wizardSend({ type: 'BACK' })}
                      className="gap-1.5"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">
                    Step {wizardCtx.currentStep} of {TOTAL_WIZARD_STEPS}
                  </span>
                  {wizardCtx.currentStep < TOTAL_WIZARD_STEPS ? (
                    <Button
                      variant="primary"
                      onClick={() => wizardSend({ type: 'NEXT' })}
                      disabled={!canGoNext}
                      className="gap-1.5"
                      data-tour="wizard-next-btn"
                    >
                      Next
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => wizardSend({ type: 'COMPLETE' })}
                      className="gap-1.5"
                    >
                      Create Course
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ===================== WORKFLOW PHASE ===================== */}
      {isWorkflowPhase && (
        <Card
          data-wizard-state={
            wfIsCompleted ? 'completed'
              : wfIsFailed ? 'failed'
              : isAwaitingApproval ? 'awaiting-approval'
              : isSendingSignal ? 'sending-signal'
              : 'processing'
          }
          data-wizard-step={pendingStep ? getWorkflowStepLabel(pendingStep).toLowerCase().replace(/\s+/g, '-') : ''}
          data-wizard-progress={workflowMachineState.context.progressPercent}
        >
          {/* Processing */}
          {showProcessing && (
            <CardContent>
              <FunLoadingOverlay
                title="Building Your Course"
                messages={courseCreationMessages}
                progress={workflowMachineState.context.progressPercent}
              />
            </CardContent>
          )}

          {/* Step Review */}
          {showStepReview && (
            <>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle as="h3">
                    {stepLabel}
                  </CardTitle>
                </div>
                <div className="w-full h-1 bg-page rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                    style={{ width: `${(stepNumber / TOTAL_WORKFLOW_STEPS) * 100}%` }}
                  />
                </div>
              </CardHeader>

              {workflowMachineState.context.stepData && workflowMachineState.context.pendingStep && (
                <CardContent className="max-h-[70vh] overflow-y-auto">
                  <StepDataRenderer
                    step={workflowMachineState.context.pendingStep}
                    data={workflowMachineState.context.stepData}
                    onModificationsChange={setPendingModifications}
                    onAssignGaps={workflowMachineState.context.pendingStep === WorkflowStepType.COMBINED_REVIEW ? handleAssignGaps : undefined}
                    deferralInfo={deferralInfo}
                  />
                </CardContent>
              )}

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
                        onClick={() => { setShowRejectForm(false); setFeedback(''); }}
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

          {/* Completed */}
          {wfIsCompleted && (
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
                {workflowMachineState.context.courseId && (
                  <Button
                    variant="primary"
                    onClick={() => router.push(`/course/${workflowMachineState.context.courseId}/editor`)}
                    className="gap-2"
                  >
                    Open in Editor
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          )}

          {/* Failed */}
          {wfIsFailed && (
            <CardContent>
              <div className="flex flex-col items-center text-center py-12">
                <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                  <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-xl font-semibold text-primary mb-2">
                  Something went wrong
                </h2>
                <p className="text-sm text-secondary mb-6">
                  {workflowMachineState.context.error ?? 'An unexpected error occurred'}
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
                    onClick={() => {
                      workflowSend({ type: 'RESET' });
                      setPhase('wizard');
                    }}
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
      )}

      {/* Error toast */}
      {isWorkflowPhase && workflowMachineState.context.error && !wfIsFailed && (
        <div className="mt-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center justify-between">
          <p className="text-sm text-red-600 dark:text-red-400">
            {workflowMachineState.context.error}
          </p>
          <button
            onClick={() => workflowSend({ type: 'DISMISS_ERROR' })}
            className="text-sm text-red-500 hover:text-red-600 underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Gap assignment modal */}
      {showGapAssignment && workflowMachineState.context.courseId && (
        <GapAssignmentModal
          courseId={workflowMachineState.context.courseId}
          gaps={gapDescriptions}
          onClose={() => setShowGapAssignment(false)}
          onDefer={handleDefer}
        />
      )}
    </PageShell>
  );
}
