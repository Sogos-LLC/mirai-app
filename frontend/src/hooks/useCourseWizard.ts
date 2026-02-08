/**
 * useCourseWizard — Connect-Query hooks for the CourseWizardService.
 *
 * Provides hooks for all 5 generation RPCs plus state persistence.
 */

import { useMutation, useQuery } from '@connectrpc/connect-query';
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
} from '@/gen/mirai/v1/course_wizard-CourseWizardService_connectquery';

import {
  GenerateTitleRequestSchema,
  GenerateOutcomesRequestSchema,
  GenerateSMEPersonasRequestSchema,
  GenerateAudiencePersonasRequestSchema,
  GenerateToneOptionsRequestSchema,
  SaveWizardStateRequestSchema,
  DeleteWizardStateRequestSchema,
  WizardStepDataSchema,
} from '@/gen/mirai/v1/course_wizard_pb';

import type {
  SMEPersona,
  AudiencePersona,
  WizardStepData,
} from '@/gen/mirai/v1/course_wizard_pb';

// =============================================================================
// Generation Hooks
// =============================================================================

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
  };
}

export function useGenerateOutcomes() {
  const mutation = useMutation(generateOutcomes);

  return {
    mutate: async (params: {
      courseName: string;
      selectedTeamDocIds?: string[];
      selectedGlobalDocIds?: string[];
    }) => {
      const request = create(GenerateOutcomesRequestSchema, {
        courseName: params.courseName,
        selectedTeamDocIds: params.selectedTeamDocIds ?? [],
        selectedGlobalDocIds: params.selectedGlobalDocIds ?? [],
      });
      return mutation.mutateAsync(request);
    },
    isPending: mutation.isPending,
    error: mutation.error,
  };
}

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
  };
}

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
        selectedSmes: params.selectedSmes,
        selectedTeamDocIds: params.selectedTeamDocIds ?? [],
        selectedGlobalDocIds: params.selectedGlobalDocIds ?? [],
      });
      return mutation.mutateAsync(request);
    },
    isPending: mutation.isPending,
    error: mutation.error,
  };
}

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
        selectedAudiences: params.selectedAudiences,
        selectedTeamDocIds: params.selectedTeamDocIds ?? [],
        selectedGlobalDocIds: params.selectedGlobalDocIds ?? [],
      });
      return mutation.mutateAsync(request);
    },
    isPending: mutation.isPending,
    error: mutation.error,
  };
}

// =============================================================================
// State Persistence Hooks
// =============================================================================

export function useSaveWizardState() {
  const mutation = useMutation(saveWizardState);

  return {
    mutate: async (params: {
      currentStep: string;
      data: WizardStepData;
    }) => {
      const request = create(SaveWizardStateRequestSchema, {
        currentStep: params.currentStep,
        data: params.data,
      });
      return mutation.mutateAsync(request);
    },
    isPending: mutation.isPending,
    error: mutation.error,
  };
}

export function useGetWizardState() {
  const query = useQuery(getWizardState, {});

  return {
    data: query.data?.state ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useDeleteWizardState() {
  const mutation = useMutation(deleteWizardState);

  return {
    mutate: async () => {
      const request = create(DeleteWizardStateRequestSchema, {});
      return mutation.mutateAsync(request);
    },
    isPending: mutation.isPending,
    error: mutation.error,
  };
}

// =============================================================================
// Helper: create WizardStepData from wizard context
// =============================================================================

export function buildWizardStepData(ctx: {
  courseName: string;
  improvedTitle: string;
  description: string;
  desiredOutcomes: string;
  smePersonas: SMEPersona[];
  selectedSmeIds: string[];
  audiencePersonas: AudiencePersona[];
  selectedAudienceIds: string[];
  toneOptions: { id: string; name: string; description: string; levelOfDetail: number }[];
  selectedToneId: string;
  additionalContext: string;
  selectedTeamDocIds: string[];
  selectedGlobalDocIds: string[];
  strictKnowledgeOnly: boolean;
}): WizardStepData {
  return create(WizardStepDataSchema, {
    courseName: ctx.courseName,
    improvedTitle: ctx.improvedTitle,
    description: ctx.description,
    desiredOutcomes: ctx.desiredOutcomes,
    smePersonas: ctx.smePersonas,
    selectedSmeIds: ctx.selectedSmeIds,
    audiencePersonas: ctx.audiencePersonas,
    selectedAudienceIds: ctx.selectedAudienceIds,
    toneOptions: ctx.toneOptions,
    selectedToneId: ctx.selectedToneId,
    additionalContext: ctx.additionalContext,
    selectedTeamDocIds: ctx.selectedTeamDocIds,
    selectedGlobalDocIds: ctx.selectedGlobalDocIds,
    internalDataOnly: ctx.strictKnowledgeOnly,
  });
}
