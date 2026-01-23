'use client';

import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { useMachine } from '@xstate/react';
import { useRouter } from 'next/navigation';
import { AlertCircle, X } from 'lucide-react';
import { fromPromise } from 'xstate';
import {
  courseWizardMachine,
  isGenerating,
  type CourseWizardContext,
} from '@/machines/courseWizardMachine';
import {
  useGenerateTitle,
  useGenerateOutcomes,
  useGenerateSMEPersonas,
  useGenerateAudiencePersonas,
  useGenerateToneOptions,
  useGetWizardState,
  useSaveWizardState,
  useDeleteWizardState,
} from '@/hooks/useCourseWizard';
import {
  useGenerateCourseOutline,
} from '@/hooks/useAIGeneration';
import { useCreateCourse } from '@/hooks/useCourses';
import { useUploadAndProcess, useLinkSessionToCourse } from '@/hooks/useKnowledgeSources';
import type { SMEPersona, AudiencePersona, ToneOption } from '@/gen/mirai/v1/course_wizard_pb';

import WizardProgress from './WizardProgress';
import CourseNameStep from './steps/CourseNameStep';
import TitleDescriptionStep from './steps/TitleDescriptionStep';
import SMEPersonasStep from './steps/SMEPersonasStep';
import AudiencePersonasStep from './steps/AudiencePersonasStep';
import ToneSelectionStep from './steps/ToneSelectionStep';
import GeneratingStep from './steps/GeneratingStep';
import Button from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  KnowledgeUploadModal,
  KnowledgeProcessingModal,
  KnowledgeVerificationModal,
  type PendingFile,
  type ProcessedSource,
} from './modals';

// Modal state types
type KnowledgeModalState = 'closed' | 'upload' | 'processing' | 'verification';

// Generate session ID for pre-course knowledge sources
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export default function CourseWizard() {
  const router = useRouter();

  // Knowledge modal state
  const [knowledgeModalState, setKnowledgeModalState] = useState<KnowledgeModalState>('closed');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [processedSources, setProcessedSources] = useState<ProcessedSource[]>([]);
  const [processingStatus, setProcessingStatus] = useState<'processing' | 'success'>('processing');
  const [sessionId] = useState(() => generateSessionId());

  // API hooks - wizard generation
  const generateTitle = useGenerateTitle();
  const generateOutcomes = useGenerateOutcomes();
  const generateSMEPersonas = useGenerateSMEPersonas();
  const generateAudiencePersonas = useGenerateAudiencePersonas();
  const generateToneOptions = useGenerateToneOptions();
  const getSavedState = useGetWizardState();
  const saveWizardState = useSaveWizardState();
  const deleteWizardState = useDeleteWizardState();

  // API hooks - course & outline generation
  const createCourse = useCreateCourse();
  const generateCourseOutline = useGenerateCourseOutline();

  // API hooks - knowledge sources
  const uploadAndProcess = useUploadAndProcess();
  const linkSessionToCourse = useLinkSessionToCourse();

  // Create machine with provided actors
  const machineWithActors = useMemo(() => {
    return courseWizardMachine.provide({
      actors: {
        generateTitleActor: fromPromise(async ({ input }: { input: { courseName: string } }) => {
          const result = await generateTitle.mutate(input.courseName);
          return {
            improvedTitle: result.improvedTitle,
            description: result.description,
          };
        }),
        generateOutcomesActor: fromPromise(async ({ input }: { input: { courseName: string } }) => {
          // Pass sessionId for RAG context if knowledge sources were uploaded
          const result = await generateOutcomes.mutate({
            courseName: input.courseName,
            sessionId: processedSources.length > 0 ? sessionId : undefined,
          });
          return {
            outcomes: result.outcomes,
          };
        }),
        generateSMEPersonasActor: fromPromise(
          async ({ input }: { input: { title: string; description: string } }) => {
            const result = await generateSMEPersonas.mutate({
              title: input.title,
              description: input.description,
            });
            return { personas: result.personas };
          }
        ),
        generateAudiencePersonasActor: fromPromise(
          async ({
            input,
          }: {
            input: { title: string; description: string; selectedSmes: SMEPersona[] };
          }) => {
            const result = await generateAudiencePersonas.mutate({
              title: input.title,
              description: input.description,
              selectedSmes: input.selectedSmes,
            });
            return { personas: result.personas };
          }
        ),
        generateToneOptionsActor: fromPromise(
          async ({
            input,
          }: {
            input: { title: string; description: string; selectedAudiences: AudiencePersona[] };
          }) => {
            const result = await generateToneOptions.mutate({
              title: input.title,
              description: input.description,
              selectedAudiences: input.selectedAudiences,
            });
            return { options: result.options };
          }
        ),
        generateOutlineActor: fromPromise(
          async ({
            input,
          }: {
            input: {
              title: string;
              description: string;
              smePersonas: SMEPersona[];
              audiencePersonas: AudiencePersona[];
              toneOption: ToneOption | undefined;
              additionalContext: string;
            };
          }) => {
            // Step 1: Create a course with wizard data for AI generation context
            const courseResult = await createCourse.mutate({
              settings: {
                title: input.title,
                desiredOutcome: input.description,
              },
              // Include wizard data so it's stored with the course
              // This enables persona-aware outline generation and realignment features
              wizardData: {
                improvedTitle: input.title,
                description: input.description,
                smePersonas: input.smePersonas,
                selectedSmeIds: input.smePersonas.map(p => p.id),
                audiencePersonas: input.audiencePersonas,
                selectedAudienceIds: input.audiencePersonas.map(p => p.id),
                toneOptions: input.toneOption ? [input.toneOption] : [],
                selectedToneId: input.toneOption?.id ?? '',
                additionalContext: input.additionalContext,
              },
            });

            // DEBUG: Track courseID through the system
            console.log('[DEBUG-COURSEID] Wizard: createCourse returned', {
              courseId: courseResult.course?.id,
              title: courseResult.course?.settings?.title,
              hasWizardData: true,
            });

            if (!courseResult.course?.id) {
              throw new Error('Failed to create course');
            }

            const courseId = courseResult.course.id;

            // Link any knowledge sources from the wizard session to the course
            if (processedSources.length > 0) {
              try {
                const linkResult = await linkSessionToCourse.mutate({
                  sessionId,
                  courseId,
                });
                console.log('[Knowledge] Linked session sources to course:', linkResult.linkedCount);
              } catch (linkError) {
                console.error('[Knowledge] Failed to link session sources:', linkError);
                // Continue anyway - outline generation should still work
              }
            }

            // DEBUG: Track courseID through the system
            console.log('[DEBUG-COURSEID] Wizard: calling generateCourseOutline with courseId:', courseId);

            // Step 2: Generate the course outline (starts background job)
            // The job will read wizard data from the course to generate persona-aware content
            const outlineResult = await generateCourseOutline.mutate({
              courseId,
              desiredOutcome: input.description,
              additionalContext: input.additionalContext || undefined,
            });

            if (!outlineResult.job?.id) {
              throw new Error('Failed to start outline generation');
            }

            // Return courseId and job info - wizard will offer wait/background choice
            return {
              courseId,
              job: {
                id: outlineResult.job.id,
              },
            };
          }
        ),
        saveWizardStateActor: fromPromise(
          async ({
            input,
          }: {
            input: { currentStep: string; data: Record<string, unknown> };
          }) => {
            const result = await saveWizardState.mutate({
              currentStep: input.currentStep,
              data: input.data,
            });
            return { state: result.state };
          }
        ),
        deleteWizardStateActor: fromPromise(async () => {
          await deleteWizardState.mutate();
        }),
      },
    });
  }, [
    generateTitle,
    generateOutcomes,
    generateSMEPersonas,
    generateAudiencePersonas,
    generateToneOptions,
    createCourse,
    generateCourseOutline,
    saveWizardState,
    deleteWizardState,
    sessionId,
    processedSources,
    linkSessionToCourse,
  ]);

  const [state, send] = useMachine(machineWithActors);

  const context = state.context as CourseWizardContext;
  const stateValue = state.value;
  const isLoading = isGenerating(stateValue);

  // Check for saved state on mount
  useEffect(() => {
    if (getSavedState.data) {
      send({ type: 'LOAD_SAVED_STATE', state: getSavedState.data });
    } else if (!getSavedState.isLoading) {
      send({ type: 'START_FRESH' });
    }
  }, [getSavedState.data, getSavedState.isLoading, send]);

  // Handle redirect to outline page after job is queued
  useEffect(() => {
    if (state.matches('outlineJobQueued') && context.courseId) {
      // Pass the jobId so the outline page can poll for it directly
      // This avoids race conditions with job discovery via listJobsByCourse
      const url = context.outlineJobId
        ? `/course/${context.courseId}/outline?jobId=${context.outlineJobId}`
        : `/course/${context.courseId}/outline`;
      router.push(url);
    }
  }, [state, context.courseId, context.outlineJobId, router]);

  // Handle redirect to dashboard (after cancellation)
  useEffect(() => {
    if (state.matches('redirectToDashboard') || state.matches('cancelled')) {
      router.push('/dashboard');
    }
  }, [state, router]);

  const handleCancel = useCallback(() => {
    send({ type: 'CANCEL' });
  }, [send]);

  // Knowledge modal handlers
  const handleOpenKnowledgeModal = useCallback(() => {
    setKnowledgeModalState('upload');
  }, []);

  const handleCloseKnowledgeModal = useCallback(() => {
    setKnowledgeModalState('closed');
  }, []);

  const handleAddFiles = useCallback((files: PendingFile[]) => {
    setPendingFiles((prev) => [...prev, ...files]);
    // Also send to state machine for persistence
    send({ type: 'ADD_FILES', files });
  }, [send]);

  const handleRemoveFile = useCallback((fileId: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));
    // Also send to state machine for persistence
    send({ type: 'REMOVE_FILE', fileId });
  }, [send]);

  const handleUploadKnowledge = useCallback(async () => {
    if (pendingFiles.length === 0) return;

    // Transition to processing modal
    setKnowledgeModalState('processing');
    setProcessingStatus('processing');

    try {
      // Process each file through the backend
      const results: ProcessedSource[] = [];

      for (const file of pendingFiles) {
        // Read file content as Uint8Array
        const arrayBuffer = await file.file.arrayBuffer();
        const fileContent = new Uint8Array(arrayBuffer);

        const result = await uploadAndProcess.mutate({
          sessionId,
          filename: file.name,
          contentType: file.mimeType,
          fileContent,
        });

        results.push({
          id: result.sourceId,
          name: result.name,
          summary: result.summary,
          chunkCount: result.chunkCount,
          tokenCount: result.tokenCount,
        });
      }

      setProcessedSources(results);
      setProcessingStatus('success');
    } catch (error) {
      console.error('Failed to process knowledge sources:', error);
      // Return to upload modal on error
      setKnowledgeModalState('upload');
    }
  }, [pendingFiles, sessionId, uploadAndProcess]);

  const handleProcessingComplete = useCallback(() => {
    // Transition from success checkmark to verification modal
    setKnowledgeModalState('verification');
  }, []);

  const handleVerificationClose = useCallback(() => {
    setKnowledgeModalState('closed');
  }, []);

  const handleAddMoreFiles = useCallback(() => {
    // Clear pending files so user can add fresh batch
    setPendingFiles([]);
    // Transition back to upload modal
    setKnowledgeModalState('upload');
  }, []);

  // Loading state while checking for saved state
  if (state.matches('checkingSavedState') || getSavedState.isLoading) {
    return (
      <GeneratingStep
        title="Loading..."
        description="Checking for saved progress..."
      />
    );
  }

  // Resume prompt
  if (state.matches('promptResume')) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="max-w-md mx-auto text-center">
            <h2 className="text-2xl font-bold text-primary mb-4">
              Resume Your Progress?
            </h2>
            <p className="text-secondary mb-8">
              We found a saved draft from your last session. Would you like to continue
              where you left off?
            </p>
            <div className="flex gap-4 justify-center">
              <Button
                variant="secondary"
                onClick={() => send({ type: 'START_FRESH' })}
              >
                Start Fresh
              </Button>
              <Button
                variant="primary"
                onClick={() => send({ type: 'RESUME_FROM_STATE' })}
              >
                Resume Draft
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error display
  const renderError = () => {
    if (!context.error) return null;

    return (
      <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">{context.error.message}</p>
          {context.error.retryable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => send({ type: 'RETRY' })}
              className="mt-2 text-red-600"
            >
              Try Again
            </Button>
          )}
        </div>
        <button
          onClick={() => send({ type: 'DISMISS_ERROR' })}
          className="text-red-600 hover:text-red-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

  // Generating states
  if (state.matches('generatingOutcomes')) {
    return (
      <>
        <WizardProgress currentStep="courseName" isGenerating={true} />
        <GeneratingStep
          title="Generating Outcomes"
          description="Our AI is crafting learning outcomes for your course..."
          onCancel={handleCancel}
        />
      </>
    );
  }

  if (state.matches('generatingTitle')) {
    return (
      <>
        <WizardProgress currentStep="courseName" isGenerating={true} />
        <GeneratingStep
          title="Improving Your Title"
          description="Our AI is crafting an engaging title and description for your course..."
          onCancel={handleCancel}
        />
      </>
    );
  }

  if (state.matches('generatingSMEs')) {
    return (
      <>
        <WizardProgress currentStep="titleDescription" isGenerating={true} />
        <GeneratingStep
          title="Creating Expert Personas"
          description="Generating subject matter expert personas for your course..."
          onCancel={handleCancel}
        />
      </>
    );
  }

  if (state.matches('generatingAudiences')) {
    return (
      <>
        <WizardProgress currentStep="smeSelection" isGenerating={true} />
        <GeneratingStep
          title="Defining Your Audience"
          description="Creating target audience personas based on your experts..."
          onCancel={handleCancel}
        />
      </>
    );
  }

  if (state.matches('generatingTones')) {
    return (
      <>
        <WizardProgress currentStep="audienceSelection" isGenerating={true} />
        <GeneratingStep
          title="Crafting Tone Options"
          description="Generating tone and style options for your course..."
          onCancel={handleCancel}
        />
      </>
    );
  }

  if (state.matches('generatingOutline') || (typeof stateValue === 'object' && 'generatingOutline' in stateValue)) {
    return (
      <>
        <WizardProgress currentStep="toneSelection" isGenerating={true} />
        <GeneratingStep
          title="Building Your Outline"
          description="Starting outline generation..."
          onCancel={handleCancel}
        />
      </>
    );
  }

  // Outline job queued - redirecting to outline page
  if (state.matches('outlineJobQueued') || (typeof stateValue === 'object' && 'outlineJobQueued' in stateValue)) {
    return (
      <>
        <WizardProgress currentStep="toneSelection" isGenerating={true} />
        <GeneratingStep
          title="Redirecting to Outline"
          description="Taking you to your course outline..."
        />
      </>
    );
  }

  // Main wizard steps
  return (
    <>
      <WizardProgress currentStep={context.currentStep} />
      {renderError()}

      {state.matches('courseName') && (
        <CourseNameStep
          courseName={context.courseName}
          desiredOutcomes={context.desiredOutcomes}
          onCourseNameChange={(name) => send({ type: 'SET_COURSE_NAME', name })}
          onDesiredOutcomesChange={(outcomes) => send({ type: 'SET_DESIRED_OUTCOMES', outcomes })}
          onGenerateOutcomes={() => send({ type: 'GENERATE_OUTCOMES' })}
          onNext={() => send({ type: 'SUBMIT_COURSE_NAME' })}
          onCancel={handleCancel}
          isLoading={isLoading}
          isGeneratingOutcomes={state.matches('generatingOutcomes')}
          knowledgeFileCount={pendingFiles.length}
          processedSourcesCount={processedSources.length}
          onOpenKnowledgeModal={handleOpenKnowledgeModal}
        />
      )}

      {state.matches('titleDescription') && (
        <TitleDescriptionStep
          title={context.improvedTitle}
          description={context.description}
          originalCourseName={context.courseName}
          desiredOutcomes={context.desiredOutcomes}
          onTitleChange={(title) => send({ type: 'SET_TITLE', title })}
          onDescriptionChange={(description) => send({ type: 'SET_DESCRIPTION', description })}
          onNext={() => send({ type: 'APPROVE_TITLE_DESCRIPTION' })}
          onBack={() => send({ type: 'GO_BACK' })}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
      )}

      {state.matches('smeSelection') && (
        <SMEPersonasStep
          personas={context.smePersonas}
          selectedIds={context.selectedSMEIds}
          onTogglePersona={(smeId) => send({ type: 'TOGGLE_SME', smeId })}
          onEditPersona={(persona: SMEPersona) => send({ type: 'EDIT_SME', persona })}
          onAddTemplateSME={(persona: SMEPersona) => send({ type: 'ADD_TEMPLATE_SME', persona })}
          onNext={() => send({ type: 'APPROVE_SMES' })}
          onBack={() => send({ type: 'GO_BACK' })}
          onRegenerate={() => send({ type: 'REGENERATE_SMES' })}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
      )}

      {state.matches('audienceSelection') && (
        <AudiencePersonasStep
          personas={context.audiencePersonas}
          selectedIds={context.selectedAudienceIds}
          onTogglePersona={(audienceId) => send({ type: 'TOGGLE_AUDIENCE', audienceId })}
          onEditPersona={(persona: AudiencePersona) => send({ type: 'EDIT_AUDIENCE', persona })}
          onAddTemplatePersona={(persona: AudiencePersona) => send({ type: 'ADD_TEMPLATE_AUDIENCE', persona })}
          onNext={() => send({ type: 'APPROVE_AUDIENCES' })}
          onBack={() => send({ type: 'GO_BACK' })}
          onRegenerate={() => send({ type: 'REGENERATE_AUDIENCES' })}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
      )}

      {state.matches('toneSelection') && (
        <ToneSelectionStep
          options={context.toneOptions}
          selectedId={context.selectedToneId}
          additionalContext={context.additionalContext}
          onSelectTone={(toneId) => send({ type: 'SELECT_TONE', toneId })}
          onContextChange={(ctx) => send({ type: 'SET_ADDITIONAL_CONTEXT', context: ctx })}
          onNext={() => send({ type: 'SUBMIT_CONTEXT' })}
          onSkip={() => send({ type: 'SKIP_CONTEXT' })}
          onBack={() => send({ type: 'GO_BACK' })}
          onRegenerate={() => send({ type: 'REGENERATE_TONES' })}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
      )}

      {/* Knowledge Source Modals */}
      <KnowledgeUploadModal
        isOpen={knowledgeModalState === 'upload'}
        onClose={handleCloseKnowledgeModal}
        onUpload={handleUploadKnowledge}
        pendingFiles={pendingFiles}
        onAddFiles={handleAddFiles}
        onRemoveFile={handleRemoveFile}
        processedSources={processedSources}
      />

      <KnowledgeProcessingModal
        isOpen={knowledgeModalState === 'processing'}
        status={processingStatus}
        fileCount={pendingFiles.length}
        onSuccessComplete={handleProcessingComplete}
      />

      <KnowledgeVerificationModal
        isOpen={knowledgeModalState === 'verification'}
        onClose={handleVerificationClose}
        onAddMore={handleAddMoreFiles}
        sources={processedSources}
      />
    </>
  );
}
