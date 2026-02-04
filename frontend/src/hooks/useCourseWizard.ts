/**
 * useCourseWizard - Connect-Query hooks for Course Wizard API
 *
 * Provides hooks for:
 * - Generating AI content (title, SME personas, audience personas, tone options)
 * - Managing wizard state (save, get, delete)
 * - Creating course from approved outline
 */

import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';

import {
  generateTitle,
  generateOutcomes,
  generateSMEPersonas,
  generateAudiencePersonas,
  generateToneOptions,
  saveWizardState,
  getWizardState,
  deleteWizardState,
  createCourseFromOutline,
} from '@/gen/mirai/v1/course_wizard-CourseWizardService_connectquery';

import {
  GenerateTitleRequestSchema,
  GenerateOutcomesRequestSchema,
  GenerateSMEPersonasRequestSchema,
  GenerateAudiencePersonasRequestSchema,
  GenerateToneOptionsRequestSchema,
  SaveWizardStateRequestSchema,
  DeleteWizardStateRequestSchema,
  CreateCourseFromOutlineRequestSchema,
  WizardStepDataSchema,
  SMEPersonaSchema,
  AudiencePersonaSchema,
  ToneOptionSchema,
  type SMEPersona,
  type AudiencePersona,
  type ToneOption,
  type WizardStepData,
  type WizardState,
} from '@/gen/mirai/v1/course_wizard_pb';

// Re-export types for convenience
export type { SMEPersona, AudiencePersona, ToneOption, WizardStepData, WizardState };

// =============================================================================
// AI Generation Hooks
// =============================================================================

/**
 * Generate improved title and description from course name
 */
export function useGenerateTitle() {
  const mutation = useMutation(generateTitle);

  return {
    mutate: async (params: {
      courseName: string;
      selectedTeamDocIds?: string[];
      selectedGlobalDocIds?: string[];
    }) => {
      const request = create(GenerateTitleRequestSchema, {
        courseName: params.courseName,
        selectedTeamDocIds: params.selectedTeamDocIds ?? [],
        selectedGlobalDocIds: params.selectedGlobalDocIds ?? [],
      });
      return mutation.mutateAsync(request);
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Generate desired course outcomes from course name (magic wand feature)
 * Uses RAG context from selected knowledge sources (team + global) and uploaded files (sessionId).
 */
export function useGenerateOutcomes() {
  const mutation = useMutation(generateOutcomes);

  return {
    mutate: async (params: {
      courseName: string;
      sessionId?: string;
      selectedTeamDocIds?: string[];
      selectedGlobalDocIds?: string[];
    }) => {
      const request = create(GenerateOutcomesRequestSchema, {
        courseName: params.courseName,
        sessionId: params.sessionId,
        selectedTeamDocIds: params.selectedTeamDocIds ?? [],
        selectedGlobalDocIds: params.selectedGlobalDocIds ?? [],
      });
      return mutation.mutateAsync(request);
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Generate SME personas based on title and description
 * Uses RAG context from selected knowledge sources.
 */
export function useGenerateSMEPersonas() {
  const mutation = useMutation(generateSMEPersonas);

  return {
    mutate: async (params: {
      title: string;
      description: string;
      selectedTeamDocIds?: string[];
      selectedGlobalDocIds?: string[];
    }) => {
      const request = create(GenerateSMEPersonasRequestSchema, {
        title: params.title,
        description: params.description,
        selectedTeamDocIds: params.selectedTeamDocIds ?? [],
        selectedGlobalDocIds: params.selectedGlobalDocIds ?? [],
      });
      return mutation.mutateAsync(request);
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Generate audience personas based on course info and selected SMEs
 * Uses RAG context from selected knowledge sources.
 */
export function useGenerateAudiencePersonas() {
  const mutation = useMutation(generateAudiencePersonas);

  return {
    mutate: async (params: {
      title: string;
      description: string;
      selectedSmes: SMEPersona[];
      selectedTeamDocIds?: string[];
      selectedGlobalDocIds?: string[];
    }) => {
      const request = create(GenerateAudiencePersonasRequestSchema, {
        title: params.title,
        description: params.description,
        selectedSmes: params.selectedSmes.map(sme =>
          create(SMEPersonaSchema, sme)
        ),
        selectedTeamDocIds: params.selectedTeamDocIds ?? [],
        selectedGlobalDocIds: params.selectedGlobalDocIds ?? [],
      });
      return mutation.mutateAsync(request);
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Generate tone options based on course info and selected audiences
 * Uses RAG context from selected knowledge sources.
 */
export function useGenerateToneOptions() {
  const mutation = useMutation(generateToneOptions);

  return {
    mutate: async (params: {
      title: string;
      description: string;
      selectedAudiences: AudiencePersona[];
      selectedTeamDocIds?: string[];
      selectedGlobalDocIds?: string[];
    }) => {
      const request = create(GenerateToneOptionsRequestSchema, {
        title: params.title,
        description: params.description,
        selectedAudiences: params.selectedAudiences.map(audience =>
          create(AudiencePersonaSchema, audience)
        ),
        selectedTeamDocIds: params.selectedTeamDocIds ?? [],
        selectedGlobalDocIds: params.selectedGlobalDocIds ?? [],
      });
      return mutation.mutateAsync(request);
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Wizard State Management Hooks
// =============================================================================

/**
 * Get saved wizard state for current user
 */
export function useGetWizardState() {
  const query = useQuery(getWizardState, {});

  return {
    data: query.data?.state ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Save wizard state for resume capability
 */
export function useSaveWizardState() {
  const queryClient = useQueryClient();
  const mutation = useMutation(saveWizardState);

  return {
    mutate: async (params: {
      currentStep: string;
      data: Partial<WizardStepData>;
    }) => {
      const wizardData = create(WizardStepDataSchema, {
        courseName: params.data.courseName ?? '',
        desiredOutcomes: params.data.desiredOutcomes ?? '',
        improvedTitle: params.data.improvedTitle ?? '',
        description: params.data.description ?? '',
        smePersonas: params.data.smePersonas?.map(p => create(SMEPersonaSchema, p)) ?? [],
        selectedSmeIds: params.data.selectedSmeIds ?? [],
        audiencePersonas: params.data.audiencePersonas?.map(p => create(AudiencePersonaSchema, p)) ?? [],
        selectedAudienceIds: params.data.selectedAudienceIds ?? [],
        toneOptions: params.data.toneOptions?.map(t => create(ToneOptionSchema, t)) ?? [],
        selectedToneId: params.data.selectedToneId ?? '',
        additionalContext: params.data.additionalContext ?? '',
        selectedTeamDocIds: params.data.selectedTeamDocIds ?? [],
        selectedGlobalDocIds: params.data.selectedGlobalDocIds ?? [],
        internalDataOnly: params.data.internalDataOnly ?? false,
      });

      const request = create(SaveWizardStateRequestSchema, {
        currentStep: params.currentStep,
        data: wizardData,
      });

      const result = await mutation.mutateAsync(request);

      // Invalidate wizard state query to refetch
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getWizardState,
          cardinality: undefined,
        }),
      });

      return result;
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Delete wizard state (after course creation or cancellation)
 */
export function useDeleteWizardState() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteWizardState);

  return {
    mutate: async () => {
      const request = create(DeleteWizardStateRequestSchema, {});
      const result = await mutation.mutateAsync(request);

      // Invalidate wizard state query
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getWizardState,
          cardinality: undefined,
        }),
      });

      return result;
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Course Creation Hook
// =============================================================================

/**
 * Create course from approved outline
 */
export function useCreateCourseFromOutline() {
  const queryClient = useQueryClient();
  const mutation = useMutation(createCourseFromOutline);

  return {
    mutate: async (params: {
      outlineId: string;
      wizardData: Partial<WizardStepData>;
    }) => {
      const wizardData = create(WizardStepDataSchema, {
        courseName: params.wizardData.courseName ?? '',
        desiredOutcomes: params.wizardData.desiredOutcomes ?? '',
        improvedTitle: params.wizardData.improvedTitle ?? '',
        description: params.wizardData.description ?? '',
        smePersonas: params.wizardData.smePersonas?.map(p => create(SMEPersonaSchema, p)) ?? [],
        selectedSmeIds: params.wizardData.selectedSmeIds ?? [],
        audiencePersonas: params.wizardData.audiencePersonas?.map(p => create(AudiencePersonaSchema, p)) ?? [],
        selectedAudienceIds: params.wizardData.selectedAudienceIds ?? [],
        toneOptions: params.wizardData.toneOptions?.map(t => create(ToneOptionSchema, t)) ?? [],
        selectedToneId: params.wizardData.selectedToneId ?? '',
        additionalContext: params.wizardData.additionalContext ?? '',
        selectedTeamDocIds: params.wizardData.selectedTeamDocIds ?? [],
        selectedGlobalDocIds: params.wizardData.selectedGlobalDocIds ?? [],
        internalDataOnly: params.wizardData.internalDataOnly ?? false,
      });

      const request = create(CreateCourseFromOutlineRequestSchema, {
        outlineId: params.outlineId,
        wizardData: wizardData,
      });

      const result = await mutation.mutateAsync(request);

      // Invalidate wizard state and courses queries
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getWizardState,
          cardinality: undefined,
        }),
      });
      // Also invalidate course list
      await queryClient.invalidateQueries({ queryKey: ['courses'] });

      return result;
    },
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
