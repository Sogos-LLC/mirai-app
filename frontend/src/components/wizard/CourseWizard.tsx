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
  type WizardKnowledgeSource,
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
import { useListKnowledgeSources, KnowledgeSourceStatus } from '@/hooks/useTeamKnowledge';
import { useListTeams } from '@/hooks/useTeams';
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

  // Fetch global knowledge (no teamId = global/tenant-level knowledge)
  const { sources: globalKnowledgeSources, isLoading: globalKnowledgeLoading } = useListKnowledgeSources();

  // Fetch all teams the user is a member/lead of
  const { data: userTeams, isLoading: teamsLoading } = useListTeams();

  // For team knowledge, we need to fetch from each team the user belongs to
  // We'll use individual hooks for the first few teams (React hooks limitation)
  // In practice, most users belong to 1-3 teams
  const team0Id = userTeams[0]?.id;
  const team1Id = userTeams[1]?.id;
  const team2Id = userTeams[2]?.id;

  const { sources: team0Sources, isLoading: team0Loading } = useListKnowledgeSources(team0Id);
  const { sources: team1Sources, isLoading: team1Loading } = useListKnowledgeSources(team1Id);
  const { sources: team2Sources, isLoading: team2Loading } = useListKnowledgeSources(team2Id);

  // Combine team knowledge loading state
  const teamKnowledgeLoading = teamsLoading ||
    (team0Id && team0Loading) ||
    (team1Id && team1Loading) ||
    (team2Id && team2Loading);

  // Filter to only ready sources
  const readyGlobalKnowledge = globalKnowledgeSources.filter(
    (source) => source.status === KnowledgeSourceStatus.READY
  );

  // Combine all team sources and filter to ready
  const allTeamSources = useMemo(() => {
    const sources = [
      ...team0Sources,
      ...team1Sources,
      ...team2Sources,
    ];
    // Dedupe by ID in case same source appears in multiple teams
    const seen = new Set<string>();
    return sources.filter((source) => {
      if (seen.has(source.id)) return false;
      seen.add(source.id);
      return source.status === KnowledgeSourceStatus.READY;
    });
  }, [team0Sources, team1Sources, team2Sources]);

  // Convert to wizard format
  const availableGlobalDocs: WizardKnowledgeSource[] = readyGlobalKnowledge.map((source) => ({
    id: source.id,
    name: source.name,
    tokenCount: source.tokenCount ?? 0,
    summary: source.summary ?? undefined,
    scope: 'global' as const,
  }));

  // Convert team knowledge to wizard format
  const availableTeamDocs: WizardKnowledgeSource[] = allTeamSources.map((source) => ({
    id: source.id,
    name: source.name,
    tokenCount: source.tokenCount ?? 0,
    summary: source.summary ?? undefined,
    scope: 'team' as const,
  }));

  // Calculate totals for display in CourseNameStep
  const totalKnowledgeCount = availableTeamDocs.length + availableGlobalDocs.length;
  const totalKnowledgeTokens = [...availableTeamDocs, ...availableGlobalDocs].reduce(
    (sum, doc) => sum + doc.tokenCount,
    0
  );

  // Create machine with provided actors
  const machineWithActors = useMemo(() => {
    return courseWizardMachine.provide({
      actors: {
        generateTitleActor: fromPromise(async ({ input }: { input: { courseName: string; selectedTeamDocIds: string[]; selectedGlobalDocIds: string[] } }) => {
          const result = await generateTitle.mutate({
            courseName: input.courseName,
            selectedTeamDocIds: input.selectedTeamDocIds,
            selectedGlobalDocIds: input.selectedGlobalDocIds,
          });
          return {
            improvedTitle: result.improvedTitle,
            description: result.description,
          };
        }),
        generateOutcomesActor: fromPromise(async ({ input }: { input: { courseName: string; selectedTeamDocIds: string[]; selectedGlobalDocIds: string[] } }) => {
          // Pass sessionId for RAG context if knowledge sources were uploaded
          // Also pass selected team/global doc IDs for existing knowledge sources
          const result = await generateOutcomes.mutate({
            courseName: input.courseName,
            sessionId: processedSources.length > 0 ? sessionId : undefined,
            selectedTeamDocIds: input.selectedTeamDocIds,
            selectedGlobalDocIds: input.selectedGlobalDocIds,
          });
          return {
            outcomes: result.outcomes,
          };
        }),
        generateSMEPersonasActor: fromPromise(
          async ({ input }: { input: { title: string; description: string; selectedTeamDocIds: string[]; selectedGlobalDocIds: string[] } }) => {
            const result = await generateSMEPersonas.mutate({
              title: input.title,
              description: input.description,
              selectedTeamDocIds: input.selectedTeamDocIds,
              selectedGlobalDocIds: input.selectedGlobalDocIds,
            });
            return { personas: result.personas };
          }
        ),
        generateAudiencePersonasActor: fromPromise(
          async ({
            input,
          }: {
            input: { title: string; description: string; selectedSmes: SMEPersona[]; selectedTeamDocIds: string[]; selectedGlobalDocIds: string[] };
          }) => {
            const result = await generateAudiencePersonas.mutate({
              title: input.title,
              description: input.description,
              selectedSmes: input.selectedSmes,
              selectedTeamDocIds: input.selectedTeamDocIds,
              selectedGlobalDocIds: input.selectedGlobalDocIds,
            });
            return { personas: result.personas };
          }
        ),
        generateToneOptionsActor: fromPromise(
          async ({
            input,
          }: {
            input: { title: string; description: string; selectedAudiences: AudiencePersona[]; selectedTeamDocIds: string[]; selectedGlobalDocIds: string[] };
          }) => {
            const result = await generateToneOptions.mutate({
              title: input.title,
              description: input.description,
              selectedAudiences: input.selectedAudiences,
              selectedTeamDocIds: input.selectedTeamDocIds,
              selectedGlobalDocIds: input.selectedGlobalDocIds,
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
              internalDataOnly: boolean;
              selectedTeamDocIds: string[];
              selectedGlobalDocIds: string[];
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
                internalDataOnly: input.internalDataOnly,
                selectedTeamDocIds: input.selectedTeamDocIds,
                selectedGlobalDocIds: input.selectedGlobalDocIds,
              },
            });

            // DEBUG: Track courseID through the system
            console.log('[DEBUG-COURSEID] Wizard: createCourse returned', {
              courseId: courseResult.course?.id,
              title: courseResult.course?.settings?.title,
              hasWizardData: true,
              selectedKnowledge: {
                teamDocs: input.selectedTeamDocIds.length,
                globalDocs: input.selectedGlobalDocIds.length,
              },
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

  // Load available knowledge sources into state machine when ready
  useEffect(() => {
    if (!globalKnowledgeLoading && !teamKnowledgeLoading && !knowledgeLoaded) {
      send({
        type: 'SET_AVAILABLE_KNOWLEDGE',
        teamDocs: availableTeamDocs,
        globalDocs: availableGlobalDocs,
      });
      setKnowledgeLoaded(true);
    }
  }, [globalKnowledgeLoading, teamKnowledgeLoading, knowledgeLoaded, availableTeamDocs, availableGlobalDocs, send]);

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
    setIsKnowledgeModalOpen(true);
  }, []);

  const handleCloseKnowledgeModal = useCallback(() => {
    // When closing, clear the done files from pending list
    const successfulFiles = pendingFiles.filter(f => f.status === 'done');
    if (successfulFiles.length > 0) {
      setPendingFiles(prev => prev.filter(f => f.status !== 'done'));
    }
    setIsKnowledgeModalOpen(false);
  }, [pendingFiles]);

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

  const handleUpdateFileStatus = useCallback((fileId: string, status: PendingFile['status'], error?: string) => {
    setPendingFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, status, error } : f
      )
    );
  }, []);

  const handleUploadFile = useCallback(async (file: PendingFile): Promise<ProcessedSource> => {
    // Read file content as Uint8Array
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

    // Add to processed sources
    setProcessedSources((prev) => [...prev, processed]);

    return processed;
  }, [sessionId, uploadAndProcess]);


  // Loading state only while checking for saved state - don't block on knowledge loading
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
