'use client';

import { fromPromise } from 'xstate';
import type { SMEPersona, AudiencePersona, ToneOption, WizardStepData } from '@/gen/mirai/v1/course_wizard_pb';
import { GenerationJobType } from '@/gen/mirai/v1/ai_generation_types_pb';

/**
 * Dependencies for creating wizard actor implementations.
 * Each corresponds to a mutation hook from useCourseWizard / useAIGeneration / etc.
 */
export interface WizardActorDeps {
  generateTitle: {
    mutate: (params: {
      courseName: string;
      selectedTeamDocIds: string[];
      selectedGlobalDocIds: string[];
    }) => Promise<{ improvedTitle: string; description: string }>;
  };
  generateOutcomes: {
    mutate: (params: {
      courseName: string;
      sessionId?: string;
      selectedTeamDocIds: string[];
      selectedGlobalDocIds: string[];
    }) => Promise<{ outcomes: string }>;
  };
  generateSMEPersonas: {
    mutate: (params: {
      title: string;
      description: string;
      selectedTeamDocIds: string[];
      selectedGlobalDocIds: string[];
    }) => Promise<{ personas: SMEPersona[] }>;
  };
  generateAudiencePersonas: {
    mutate: (params: {
      title: string;
      description: string;
      selectedSmes: SMEPersona[];
      selectedTeamDocIds: string[];
      selectedGlobalDocIds: string[];
    }) => Promise<{ personas: AudiencePersona[] }>;
  };
  generateToneOptions: {
    mutate: (params: {
      title: string;
      description: string;
      selectedAudiences: AudiencePersona[];
      selectedTeamDocIds: string[];
      selectedGlobalDocIds: string[];
    }) => Promise<{ options: ToneOption[] }>;
  };
  createCourse: {
    mutate: (params: {
      settings: { title: string; desiredOutcome: string };
      wizardData: {
        improvedTitle: string;
        description: string;
        smePersonas: SMEPersona[];
        selectedSmeIds: string[];
        audiencePersonas: AudiencePersona[];
        selectedAudienceIds: string[];
        toneOptions: ToneOption[];
        selectedToneId: string;
        additionalContext: string;
        internalDataOnly: boolean;
        selectedTeamDocIds: string[];
        selectedGlobalDocIds: string[];
      };
    }) => Promise<{ course?: { id?: string; settings?: { title?: string } } }>;
  };
  generateCourseOutline: {
    mutate: (params: {
      courseId: string;
      desiredOutcome: string;
      additionalContext?: string;
    }) => Promise<{ job?: { id?: string; type?: number } }>;
  };
  saveWizardState: {
    mutate: (params: {
      currentStep: string;
      data: Partial<WizardStepData>;
    }) => Promise<{ state?: unknown }>;
  };
  deleteWizardState: {
    mutate: () => Promise<unknown>;
  };
  linkSessionToCourse: {
    mutate: (params: {
      sessionId: string;
      courseId: string;
    }) => Promise<{ linkedCount: number }>;
  };
  /** Session ID for linking uploaded knowledge sources */
  sessionId: string;
  /** Sources already processed in this wizard session */
  processedSources: { id: string; name: string }[];
}

/**
 * Creates concrete actor implementations for courseWizardMachine.provide().
 * Extracts the ~200 lines of inline fromPromise definitions from CourseWizard.tsx.
 */
export function createCourseWizardActors(deps: WizardActorDeps) {
  return {
    generateTitleActor: fromPromise(
      async ({ input }: { input: { courseName: string; selectedTeamDocIds: string[]; selectedGlobalDocIds: string[] } }) => {
        const result = await deps.generateTitle.mutate({
          courseName: input.courseName,
          selectedTeamDocIds: input.selectedTeamDocIds,
          selectedGlobalDocIds: input.selectedGlobalDocIds,
        });
        return {
          improvedTitle: result.improvedTitle,
          description: result.description,
        };
      }
    ),

    generateOutcomesActor: fromPromise(
      async ({ input }: { input: { courseName: string; selectedTeamDocIds: string[]; selectedGlobalDocIds: string[] } }) => {
        const result = await deps.generateOutcomes.mutate({
          courseName: input.courseName,
          sessionId: deps.processedSources.length > 0 ? deps.sessionId : undefined,
          selectedTeamDocIds: input.selectedTeamDocIds,
          selectedGlobalDocIds: input.selectedGlobalDocIds,
        });
        return { outcomes: result.outcomes };
      }
    ),

    generateSMEPersonasActor: fromPromise(
      async ({ input }: { input: { title: string; description: string; selectedTeamDocIds: string[]; selectedGlobalDocIds: string[] } }) => {
        const result = await deps.generateSMEPersonas.mutate({
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
        const result = await deps.generateAudiencePersonas.mutate({
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
        const result = await deps.generateToneOptions.mutate({
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
        // Step 1: Create course with wizard data
        const courseResult = await deps.createCourse.mutate({
          settings: {
            title: input.title,
            desiredOutcome: input.description,
          },
          wizardData: {
            improvedTitle: input.title,
            description: input.description,
            smePersonas: input.smePersonas,
            selectedSmeIds: input.smePersonas.map((p) => p.id),
            audiencePersonas: input.audiencePersonas,
            selectedAudienceIds: input.audiencePersonas.map((p) => p.id),
            toneOptions: input.toneOption ? [input.toneOption] : [],
            selectedToneId: input.toneOption?.id ?? '',
            additionalContext: input.additionalContext,
            internalDataOnly: input.internalDataOnly,
            selectedTeamDocIds: input.selectedTeamDocIds,
            selectedGlobalDocIds: input.selectedGlobalDocIds,
          },
        });

        if (!courseResult.course?.id) {
          throw new Error('Failed to create course');
        }

        const courseId = courseResult.course.id;

        // Link uploaded knowledge sources to the course
        if (deps.processedSources.length > 0) {
          try {
            const linkResult = await deps.linkSessionToCourse.mutate({
              sessionId: deps.sessionId,
              courseId,
            });
            console.log('[Knowledge] Linked session sources to course:', linkResult.linkedCount);
          } catch (linkError) {
            console.error('[Knowledge] Failed to link session sources:', linkError);
          }
        }

        // Step 2: Generate course outline (starts background job)
        const outlineResult = await deps.generateCourseOutline.mutate({
          courseId,
          desiredOutcome: input.description,
          additionalContext: input.additionalContext || undefined,
        });

        if (!outlineResult.job?.id) {
          throw new Error('Failed to start outline generation');
        }

        return {
          courseId,
          job: {
            id: outlineResult.job.id,
            type: outlineResult.job.type ?? GenerationJobType.COURSE_OUTLINE,
          },
        };
      }
    ),

    saveWizardStateActor: fromPromise(
      async ({
        input,
      }: {
        input: { currentStep: string; data: Partial<WizardStepData> };
      }) => {
        const result = await deps.saveWizardState.mutate({
          currentStep: input.currentStep,
          data: input.data,
        });
        return { state: result.state };
      }
    ),

    deleteWizardStateActor: fromPromise(async () => {
      await deps.deleteWizardState.mutate();
    }),
  };
}
