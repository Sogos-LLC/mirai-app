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
import { GeneratingOverlay } from '@/components/course/GeneratingOverlay';
import { WizardStep1CourseName } from '@/components/course/wizard/WizardStep1CourseName';
import { WizardStep2TitleDescription } from '@/components/course/wizard/WizardStep2TitleDescription';
import { WizardStep3Personas } from '@/components/course/wizard/WizardStep3Personas';
import { WizardStep4Audience } from '@/components/course/wizard/WizardStep4Audience';
import { WizardStep5ToneContext } from '@/components/course/wizard/WizardStep5ToneContext';

import {
  wizardMachine,
  TOTAL_WIZARD_STEPS,
  stepNameToNumber,
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
  useWorkflowState,
} from '@/hooks/useCourseCreation';
import { useCreateCourse } from '@/hooks/useCourses';
import { useGetJob, useGetActiveJobForCourse, useGetDeferredJobForCourse } from '@/hooks/ai-generation/useJobs';
import {
  useGenerateTitle,
  useGenerateOutcomes,
  useGenerateSMEPersonas,
  useGenerateAudiencePersonas,
  useGenerateToneOptions,
  useDeleteWizardState,
  useSaveWizardState,
  useGetWizardState,
  buildWizardStepData,
} from '@/hooks/useCourseWizard';
import { useListGapTasksForCourse } from '@/hooks/useKnowledgeGapTasks';
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

  // =========================================================================
  // Wizard hooks (Step collection phase)
  // =========================================================================
  const genTitle = useGenerateTitle();
  const genOutcomes = useGenerateOutcomes();
  const genSMEPersonas = useGenerateSMEPersonas();
  const genAudiencePersonas = useGenerateAudiencePersonas();
  const genToneOptions = useGenerateToneOptions();
  const deleteState = useDeleteWizardState();
  const saveState = useSaveWizardState();
  const { data: savedWizardState, isLoading: isLoadingWizardState } = useGetWizardState();

  // =========================================================================
  // Wizard XState Machine
  // =========================================================================
  const [wizardState, wizardSend] = useMachine(
    wizardMachine.provide({
      actors: {
        generateOutcomesActor: fromPromise(async ({ input }) => {
          const result = await genOutcomes.mutate({
            courseName: input.courseName,
            selectedTeamDocIds: input.teamDocIds,
            selectedGlobalDocIds: input.globalDocIds,
          });
          return result.outcomes;
        }),
        generateTitleActor: fromPromise(async ({ input }) => {
          const result = await genTitle.mutate({
            courseName: input.courseName,
            selectedTeamDocIds: input.teamDocIds,
            selectedGlobalDocIds: input.globalDocIds,
          });
          return {
            improvedTitle: result.improvedTitle,
            description: result.description,
          };
        }),
        generateSMEPersonasActor: fromPromise(async ({ input }) => {
          const result = await genSMEPersonas.mutate({
            title: input.title,
            description: input.description,
            selectedTeamDocIds: input.teamDocIds,
            selectedGlobalDocIds: input.globalDocIds,
          });
          return result.personas;
        }),
        generateAudiencePersonasActor: fromPromise(async ({ input }) => {
          const result = await genAudiencePersonas.mutate({
            title: input.title,
            description: input.description,
            selectedSmes: input.selectedSmes,
            selectedTeamDocIds: input.teamDocIds,
            selectedGlobalDocIds: input.globalDocIds,
          });
          return result.personas;
        }),
        generateToneOptionsActor: fromPromise(async ({ input }) => {
          const result = await genToneOptions.mutate({
            title: input.title,
            description: input.description,
            selectedAudiences: input.selectedAudiences,
            selectedTeamDocIds: input.teamDocIds,
            selectedGlobalDocIds: input.globalDocIds,
          });
          return result.options;
        }),
        saveStateActor: fromPromise(async () => {
          // No-op — state saving removed
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
  // Resume by courseId — look up the active job for this course
  const { data: courseJob } = useGetActiveJobForCourse(resumeCourseId);
  // Look for a deferred job for this course (gap tasks assigned)
  const { data: deferredJob } = useGetDeferredJobForCourse(resumeCourseId);

  // Gap task tracking for deferred courses
  const { data: gapTasks } = useListGapTasksForCourse(resumeCourseId ?? '');
  const [deferralInfo, setDeferralInfo] = useState<{
    totalTasks: number;
    completedTasks: number;
  } | null>(null);

  useEffect(() => {
    if (!workflowMachineState.matches('idle')) return;

    // Prefer explicit jobId, fall back to courseId lookup
    const job = resumeJob ?? courseJob;
    if (!job) return;

    const courseId = job.courseId;
    if (!courseId) return;

    // Skip wizard, go straight to workflow phase with this specific job
    setPhase('workflow');
    workflowSend({
      type: 'RESUME',
      jobId: job.id,
      courseId,
      status: job.status as GenerationJobStatus,
    });
  }, [resumeJob, courseJob, workflowMachineState, workflowSend]);

  // Resume from deferral: restore wizard state when a deferred job is found
  const [deferralRestored, setDeferralRestored] = useState(false);
  useEffect(() => {
    if (deferralRestored) return;
    if (!resumeCourseId || !deferredJob) return;
    // Don't restore if an active job was found (takes precedence)
    if (resumeJob || courseJob) return;
    if (isLoadingWizardState) return;

    // Compute gap task counts
    const total = gapTasks.length;
    const completed = gapTasks.filter(
      (t) => t.status === KnowledgeGapTaskStatus.COMPLETED
    ).length;
    setDeferralInfo({ totalTasks: total, completedTasks: completed });

    // Restore wizard state if saved
    if (savedWizardState?.data) {
      const data = savedWizardState.data;
      const step = stepNameToNumber(savedWizardState.currentStep);
      wizardSend({
        type: 'RESTORE_STATE',
        state: {
          courseName: data.courseName,
          improvedTitle: data.improvedTitle,
          description: data.description,
          desiredOutcomes: data.desiredOutcomes,
          smePersonas: [...data.smePersonas],
          selectedSmeIds: [...data.selectedSmeIds],
          audiencePersonas: [...data.audiencePersonas],
          selectedAudienceIds: [...data.selectedAudienceIds],
          toneOptions: [...data.toneOptions],
          selectedToneId: data.selectedToneId,
          additionalContext: data.additionalContext,
          enableInternalKnowledge: data.selectedTeamDocIds.length > 0 || data.selectedGlobalDocIds.length > 0,
          selectedTeamDocIds: [...data.selectedTeamDocIds],
          selectedGlobalDocIds: [...data.selectedGlobalDocIds],
          strictKnowledgeOnly: data.internalDataOnly,
        },
        step,
      });
    }

    setDeferralRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredJob, resumeJob, courseJob, savedWizardState, isLoadingWizardState, deferralRestored, resumeCourseId, gapTasks]);

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

        // 1. Create course record
        const courseResult = await createCourse.mutate({
          settings: { title: ctx.improvedTitle || ctx.courseName },
        });
        const courseId = courseResult.course?.id;
        if (!courseId) throw new Error('Failed to create course');

        // 2. Find the selected tone object
        const selectedTone = ctx.toneOptions.find((t) => t.id === ctx.selectedToneId);

        // 3. Start Temporal workflow with wizard data
        const result = await startCreation.mutate({
          courseId,
          topic: ctx.courseName,
          audience: ctx.selectedAudienceIds.join(','), // audience descriptions
          enableInternalKnowledge: ctx.enableInternalKnowledge,
          selectedTeamDocIds: ctx.selectedTeamDocIds.length > 0 ? ctx.selectedTeamDocIds : undefined,
          selectedGlobalDocIds: ctx.selectedGlobalDocIds.length > 0 ? ctx.selectedGlobalDocIds : undefined,
          enableWebResearch: ctx.enableWebResearch,
          strictKnowledgeOnly: ctx.enableInternalKnowledge && ctx.strictKnowledgeOnly,
          // Wizard-enriched data
          desiredOutcomes: ctx.desiredOutcomes,
          improvedTitle: ctx.improvedTitle,
          description: ctx.description,
          smePersonas: ctx.smePersonas,
          selectedSmeIds: ctx.selectedSmeIds,
          audiencePersonas: ctx.audiencePersonas,
          selectedAudienceIds: ctx.selectedAudienceIds,
          selectedTone,
          additionalContext: ctx.additionalContext,
        });

        if (result.job?.id) {
          // 4. Delete wizard state (no longer needed)
          deleteState.mutate().catch(() => {}); // fire-and-forget

          // 5. Transition to workflow phase
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

  const isGenerating = [
    'generatingOutcomes', 'generatingTitle', 'generatingPersonas',
    'generatingAudience', 'generatingTone',
  ].some((s) => wizardState.matches(s));

  const wizardCtx = wizardState.context;

  const canGoNext = (() => {
    switch (wizardCtx.currentStep) {
      case 1: return wizardCtx.courseName.trim().length > 0;
      case 2: return wizardCtx.improvedTitle.trim().length > 0;
      case 3: return wizardCtx.selectedSmeIds.length > 0;
      case 4: return wizardCtx.selectedAudienceIds.length > 0;
      case 5: return wizardCtx.selectedToneId !== '';
      default: return false;
    }
  })();

  const getGeneratingOverlayProps = () => {
    if (wizardState.matches('generatingOutcomes')) {
      return { title: 'Generating Outcomes', message: 'AI is analyzing your topic to suggest learning outcomes...' };
    }
    if (wizardState.matches('generatingTitle')) {
      return { title: 'Refining Your Title', message: 'AI is crafting an optimized course title and description...' };
    }
    if (wizardState.matches('generatingPersonas')) {
      return { title: 'Creating Expert Personas', message: 'AI is generating subject matter expert profiles for your course...' };
    }
    if (wizardState.matches('generatingAudience')) {
      return { title: 'Defining Audiences', message: 'AI is creating target learner profiles based on your experts...' };
    }
    if (wizardState.matches('generatingTone')) {
      return { title: 'Crafting Tone Options', message: 'AI is preparing tone and style options for your course...' };
    }
    return { title: 'Working...', message: 'Please wait...' };
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

  const handleDefer = useCallback(async () => {
    setShowGapAssignment(false);

    // Save wizard state so it can be restored on resume
    const stepData = buildWizardStepData(wizardState.context);
    saveState.mutate({
      currentStep: 'toneSelection', // save at last wizard step
      data: stepData,
    }).catch(() => {}); // fire-and-forget

    rejectStep.mutate({
      jobId: workflowMachineState.context.jobId!,
      step: workflowMachineState.context.pendingStep!,
      feedback: '__DEFERRED__',
    });
    router.push('/dashboard?gaps_assigned=true');
  }, [rejectStep, workflowMachineState.context, router, wizardState.context, saveState]);

  const pendingStep = workflowMachineState.context.pendingStep;

  // Clear pending modifications when step changes
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
      description="Let AI guide you through creating an engaging course in 5 simple steps"
      backButton={{ label: 'Back to Dashboard', onClick: () => router.push('/dashboard') }}
      maxWidth="6xl"
    >
      {/* ===================== WIZARD PHASE ===================== */}
      {isWizardPhase && (
        <>
          <WizardStepper currentPhase={wizardCtx.currentStep} />

          <Card>
            <CardContent>
              {isGenerating ? (
                <GeneratingOverlay {...getGeneratingOverlayProps()} />
              ) : phase === 'starting' ? (
                <GeneratingOverlay
                  title="Starting Course Creation"
                  message="Setting up your AI-powered course generation workflow..."
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

                  {/* Wizard error banner */}
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

                  {/* Start error banner */}
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
                  {wizardCtx.currentStep === 1 && (
                    <WizardStep1CourseName
                      context={wizardCtx}
                      send={wizardSend}
                      isGeneratingOutcomes={wizardState.matches('generatingOutcomes')}
                    />
                  )}
                  {wizardCtx.currentStep === 2 && (
                    <WizardStep2TitleDescription context={wizardCtx} send={wizardSend} />
                  )}
                  {wizardCtx.currentStep === 3 && (
                    <WizardStep3Personas context={wizardCtx} send={wizardSend} />
                  )}
                  {wizardCtx.currentStep === 4 && (
                    <WizardStep4Audience context={wizardCtx} send={wizardSend} />
                  )}
                  {wizardCtx.currentStep === 5 && (
                    <WizardStep5ToneContext context={wizardCtx} send={wizardSend} />
                  )}
                </>
              )}
            </CardContent>

            {/* Wizard footer — only show when not generating */}
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
                  {wizardCtx.currentStep < 5 ? (
                    <Button
                      variant="primary"
                      onClick={() => wizardSend({ type: 'NEXT' })}
                      disabled={!canGoNext}
                      className="gap-1.5"
                    >
                      {wizardCtx.currentStep === 1 ? 'Generate Title' : 'Next'}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => wizardSend({ type: 'COMPLETE' })}
                      disabled={!canGoNext}
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
              <div className="w-full h-1 bg-page rounded-full mb-8 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                  style={{ width: `${workflowMachineState.context.progressPercent}%` }}
                />
              </div>
              <div className="flex flex-col items-center text-center py-12">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                <p className="text-sm font-medium text-primary mb-1">
                  {workflowMachineState.context.progressMessage || 'Working on your course...'}
                </p>
                <p className="text-xs text-muted">
                  {workflowMachineState.context.progressPercent}% complete
                </p>
              </div>
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
                <CardContent className="max-h-[60vh] overflow-y-auto">
                  <StepDataRenderer
                    step={workflowMachineState.context.pendingStep}
                    data={workflowMachineState.context.stepData}
                    onModificationsChange={setPendingModifications}
                    onAssignGaps={workflowMachineState.context.pendingStep === WorkflowStepType.COMBINED_REVIEW ? handleAssignGaps : undefined}
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

      {/* Error toast (non-fatal errors during active workflow) */}
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
