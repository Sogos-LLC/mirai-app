'use client';

import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { useMachine } from '@xstate/react';
import { useRouter } from 'next/navigation';
import { AlertCircle, X } from 'lucide-react';
import {
  courseWizardMachine,
  isGenerating,
  type CourseWizardContext,
} from '@/machines/courseWizardMachine';
import { GenerationJobType } from '@/gen/mirai/v1/ai_generation_types_pb';
import { createCourseWizardActors } from '@/machines/courseWizardActors';
import { useKnowledgeLoader } from '@/hooks/useKnowledgeLoader';
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
import type { SMEPersona, AudiencePersona } from '@/gen/mirai/v1/course_wizard_pb';

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
  KnowledgeSourcesModal,
  type PendingFile,
  type ProcessedSource,
} from './modals';

// Generate session ID for pre-course knowledge sources
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export default function CourseWizard() {
  const router = useRouter();

  // Knowledge modal state
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [processedSources, setProcessedSources] = useState<ProcessedSource[]>([]);
  const [sessionId] = useState(() => generateSessionId());
  const [knowledgeLoaded, setKnowledgeLoaded] = useState(false);

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

  // Load team + global knowledge sources
  const { teamDocs: availableTeamDocs, globalDocs: availableGlobalDocs, isLoading: knowledgeLoading } = useKnowledgeLoader();

  // Create machine with provided actors
  const machineWithActors = useMemo(() => {
    return courseWizardMachine.provide({
      actors: createCourseWizardActors({
        generateTitle,
        generateOutcomes,
        generateSMEPersonas,
        generateAudiencePersonas,
        generateToneOptions,
        createCourse,
        generateCourseOutline,
        saveWizardState,
        deleteWizardState,
        linkSessionToCourse,
        sessionId,
        processedSources,
      }),
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

  // Load available knowledge sources into state machine when ready
  useEffect(() => {
    if (!knowledgeLoading && !knowledgeLoaded) {
      send({
        type: 'SET_AVAILABLE_KNOWLEDGE',
        teamDocs: availableTeamDocs,
        globalDocs: availableGlobalDocs,
      });
      setKnowledgeLoaded(true);
    }
  }, [knowledgeLoading, knowledgeLoaded, availableTeamDocs, availableGlobalDocs, send]);

  // Handle redirect after job is queued — plan page for planning jobs, outline page otherwise
  useEffect(() => {
    if (state.matches('outlineJobQueued') && context.courseId) {
      const isPlanningJob = context.outlineJobType === GenerationJobType.COURSE_PLANNING;
      const basePath = isPlanningJob
        ? `/course/${context.courseId}/plan`
        : `/course/${context.courseId}/outline`;
      const url = context.outlineJobId
        ? `${basePath}?jobId=${context.outlineJobId}`
        : basePath;
      router.push(url);
    }
  }, [state, context.courseId, context.outlineJobId, context.outlineJobType, router]);

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
    setIsKnowledgeModalOpen(true);
  }, []);

  const handleCloseKnowledgeModal = useCallback(() => {
    const successfulFiles = pendingFiles.filter(f => f.status === 'done');
    if (successfulFiles.length > 0) {
      setPendingFiles(prev => prev.filter(f => f.status !== 'done'));
    }
    setIsKnowledgeModalOpen(false);
  }, [pendingFiles]);

  const handleAddFiles = useCallback((files: PendingFile[]) => {
    setPendingFiles((prev) => [...prev, ...files]);
    send({ type: 'ADD_FILES', files });
  }, [send]);

  const handleRemoveFile = useCallback((fileId: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));
    send({ type: 'REMOVE_FILE', fileId });
  }, [send]);

  const handleUpdateFileStatus = useCallback((fileId: string, status: PendingFile['status'], error?: string) => {
    setPendingFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, status, error } : f
      )
    );
  }, []);

  const handleUploadFile = useCallback(async (file: PendingFile): Promise<ProcessedSource> => {
    const arrayBuffer = await file.file.arrayBuffer();
    const fileContent = new Uint8Array(arrayBuffer);

    const result = await uploadAndProcess.mutate({
      sessionId,
      filename: file.name,
      contentType: file.mimeType,
      fileContent,
    });

    const processed: ProcessedSource = {
      id: result.sourceId,
      name: result.name,
      summary: result.summary,
      chunkCount: result.chunkCount,
      tokenCount: result.tokenCount,
    };

    setProcessedSources((prev) => [...prev, processed]);
    return processed;
  }, [sessionId, uploadAndProcess]);

  // Loading state only while checking for saved state
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
          teamKnowledgeCount={context.selectedTeamDocIds.length + context.selectedGlobalDocIds.length}
          teamKnowledgeTokens={
            [...context.availableTeamDocs, ...context.availableGlobalDocs]
              .filter((doc) =>
                context.selectedTeamDocIds.includes(doc.id) ||
                context.selectedGlobalDocIds.includes(doc.id)
              )
              .reduce((sum, doc) => sum + doc.tokenCount, 0)
          }
          internalDataOnly={context.internalDataOnly}
          onInternalDataOnlyChange={(enabled) => send({ type: 'SET_INTERNAL_DATA_ONLY', enabled })}
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

      {/* Knowledge Sources Modal */}
      <KnowledgeSourcesModal
        isOpen={isKnowledgeModalOpen}
        onClose={handleCloseKnowledgeModal}
        teamDocs={context.availableTeamDocs}
        globalDocs={context.availableGlobalDocs}
        selectedTeamDocIds={context.selectedTeamDocIds}
        selectedGlobalDocIds={context.selectedGlobalDocIds}
        onToggleTeamDoc={(docId) => send({ type: 'TOGGLE_TEAM_DOC', docId })}
        onToggleGlobalDoc={(docId) => send({ type: 'TOGGLE_GLOBAL_DOC', docId })}
        onSelectAllTeamDocs={() => send({ type: 'SELECT_ALL_TEAM_DOCS' })}
        onDeselectAllTeamDocs={() => send({ type: 'DESELECT_ALL_TEAM_DOCS' })}
        onSelectAllGlobalDocs={() => send({ type: 'SELECT_ALL_GLOBAL_DOCS' })}
        onDeselectAllGlobalDocs={() => send({ type: 'DESELECT_ALL_GLOBAL_DOCS' })}
        onUploadFile={handleUploadFile}
        pendingFiles={pendingFiles}
        onAddFiles={handleAddFiles}
        onRemoveFile={handleRemoveFile}
        onUpdateFileStatus={handleUpdateFileStatus}
        processedSources={processedSources}
      />
    </>
  );
}
