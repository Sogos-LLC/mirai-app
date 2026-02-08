/**
 * wizardMachine — XState v5 machine for the multi-step course creation wizard.
 *
 * 5 input-collection steps with AI generation between each:
 *   step1_courseName → step2_titleDescription → step3_smePersonas
 *   → step4_audience → step5_toneContext → completed
 *
 * Each "generating*" state invokes a fromPromise actor that calls the
 * appropriate RPC. On success, results are assigned to context and the
 * machine transitions to the next step. On failure, it returns to the
 * previous step with an error message.
 */

import { createMachine, assign, fromPromise } from 'xstate';
import type {
  SMEPersona,
  AudiencePersona,
  ToneOption,
} from '@/gen/mirai/v1/course_wizard_pb';

// ============================================================
// Context
// ============================================================

export interface WizardContext {
  // Step 1
  courseName: string;
  desiredOutcomes: string;

  // Knowledge / Advanced settings
  enableInternalKnowledge: boolean;
  selectedTeamDocIds: string[];
  selectedGlobalDocIds: string[];
  enableWebResearch: boolean;
  strictKnowledgeOnly: boolean;

  // Step 2
  improvedTitle: string;
  description: string;

  // Step 3
  smePersonas: SMEPersona[];
  selectedSmeIds: string[];

  // Step 4
  audiencePersonas: AudiencePersona[];
  selectedAudienceIds: string[];

  // Step 5
  toneOptions: ToneOption[];
  selectedToneId: string;
  additionalContext: string;

  // UI state
  currentStep: number;
  error: string | null;
}

// ============================================================
// Events
// ============================================================

export type WizardEvent =
  | { type: 'SET_COURSE_NAME'; value: string }
  | { type: 'SET_DESIRED_OUTCOMES'; value: string }
  | { type: 'SET_KNOWLEDGE_SETTINGS'; enableInternalKnowledge: boolean; selectedTeamDocIds: string[]; selectedGlobalDocIds: string[]; enableWebResearch: boolean; strictKnowledgeOnly: boolean }
  | { type: 'GENERATE_OUTCOMES' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'REGENERATE' }
  | { type: 'COMPLETE' }
  | { type: 'SET_IMPROVED_TITLE'; value: string }
  | { type: 'SET_DESCRIPTION'; value: string }
  | { type: 'TOGGLE_SME'; id: string }
  | { type: 'TOGGLE_AUDIENCE'; id: string }
  | { type: 'UPDATE_SME_PERSONA'; persona: SMEPersona }
  | { type: 'UPDATE_AUDIENCE_PERSONA'; persona: AudiencePersona }
  | { type: 'ADD_SME_PERSONA'; persona: SMEPersona }
  | { type: 'ADD_AUDIENCE_PERSONA'; persona: AudiencePersona }
  | { type: 'SET_TONE'; id: string }
  | { type: 'SET_ADDITIONAL_CONTEXT'; value: string }
  | { type: 'RESTORE_STATE'; state: Partial<WizardContext>; step: number }
  | { type: 'DISMISS_ERROR' }
  | { type: 'CANCEL' };

// ============================================================
// Initial Context
// ============================================================

export const initialWizardContext: WizardContext = {
  courseName: '',
  desiredOutcomes: '',
  enableInternalKnowledge: false,
  selectedTeamDocIds: [],
  selectedGlobalDocIds: [],
  enableWebResearch: false,
  strictKnowledgeOnly: false,
  improvedTitle: '',
  description: '',
  smePersonas: [],
  selectedSmeIds: [],
  audiencePersonas: [],
  selectedAudienceIds: [],
  toneOptions: [],
  selectedToneId: '',
  additionalContext: '',
  currentStep: 1,
  error: null,
};

// ============================================================
// Actor stubs (provided by component via .provide())
// ============================================================

export const generateOutcomesActor = fromPromise<string, { courseName: string; teamDocIds: string[]; globalDocIds: string[] }>(
  async () => { throw new Error('generateOutcomesActor must be provided'); }
);

export const generateTitleActor = fromPromise<
  { improvedTitle: string; description: string },
  { courseName: string; teamDocIds: string[]; globalDocIds: string[] }
>(async () => { throw new Error('generateTitleActor must be provided'); });

export const generateSMEPersonasActor = fromPromise<
  SMEPersona[],
  { title: string; description: string; teamDocIds: string[]; globalDocIds: string[] }
>(async () => { throw new Error('generateSMEPersonasActor must be provided'); });

export const generateAudiencePersonasActor = fromPromise<
  AudiencePersona[],
  { title: string; description: string; selectedSmes: SMEPersona[]; teamDocIds: string[]; globalDocIds: string[] }
>(async () => { throw new Error('generateAudiencePersonasActor must be provided'); });

export const generateToneOptionsActor = fromPromise<
  ToneOption[],
  { title: string; description: string; selectedAudiences: AudiencePersona[]; teamDocIds: string[]; globalDocIds: string[] }
>(async () => { throw new Error('generateToneOptionsActor must be provided'); });

export const saveStateActor = fromPromise<void, { step: string; context: WizardContext }>(
  async () => { throw new Error('saveStateActor must be provided'); }
);

// ============================================================
// Machine
// ============================================================

export const wizardMachine = createMachine({
  id: 'wizard',
  initial: 'step1_courseName',
  context: initialWizardContext,
  types: {} as {
    context: WizardContext;
    events: WizardEvent;
  },
  on: {
    DISMISS_ERROR: {
      actions: assign({ error: null }),
    },
    SET_COURSE_NAME: {
      actions: assign({ courseName: ({ event }) => event.value }),
    },
    SET_DESIRED_OUTCOMES: {
      actions: assign({ desiredOutcomes: ({ event }) => event.value }),
    },
    SET_KNOWLEDGE_SETTINGS: {
      actions: assign({
        enableInternalKnowledge: ({ event }) => event.enableInternalKnowledge,
        selectedTeamDocIds: ({ event }) => event.selectedTeamDocIds,
        selectedGlobalDocIds: ({ event }) => event.selectedGlobalDocIds,
        enableWebResearch: ({ event }) => event.enableWebResearch,
        strictKnowledgeOnly: ({ event }) => event.strictKnowledgeOnly,
      }),
    },
    SET_IMPROVED_TITLE: {
      actions: assign({ improvedTitle: ({ event }) => event.value }),
    },
    SET_DESCRIPTION: {
      actions: assign({ description: ({ event }) => event.value }),
    },
    SET_ADDITIONAL_CONTEXT: {
      actions: assign({ additionalContext: ({ event }) => event.value }),
    },
    SET_TONE: {
      actions: assign({ selectedToneId: ({ event }) => event.id }),
    },
    TOGGLE_SME: {
      actions: assign({
        selectedSmeIds: ({ context, event }) =>
          context.selectedSmeIds.includes(event.id)
            ? context.selectedSmeIds.filter((id) => id !== event.id)
            : [...context.selectedSmeIds, event.id],
      }),
    },
    TOGGLE_AUDIENCE: {
      actions: assign({
        selectedAudienceIds: ({ context, event }) =>
          context.selectedAudienceIds.includes(event.id)
            ? context.selectedAudienceIds.filter((id) => id !== event.id)
            : [...context.selectedAudienceIds, event.id],
      }),
    },
    UPDATE_SME_PERSONA: {
      actions: assign({
        smePersonas: ({ context, event }) =>
          context.smePersonas.map((p) => (p.id === event.persona.id ? event.persona : p)),
      }),
    },
    UPDATE_AUDIENCE_PERSONA: {
      actions: assign({
        audiencePersonas: ({ context, event }) =>
          context.audiencePersonas.map((p) => (p.id === event.persona.id ? event.persona : p)),
      }),
    },
    ADD_SME_PERSONA: {
      actions: assign({
        smePersonas: ({ context, event }) => [...context.smePersonas, event.persona],
        selectedSmeIds: ({ context, event }) => [...context.selectedSmeIds, event.persona.id],
      }),
    },
    ADD_AUDIENCE_PERSONA: {
      actions: assign({
        audiencePersonas: ({ context, event }) => [...context.audiencePersonas, event.persona],
        selectedAudienceIds: ({ context, event }) => [...context.selectedAudienceIds, event.persona.id],
      }),
    },
    RESTORE_STATE: {
      target: '.restoring',
    },
  },
  states: {
    // Restore route — jumps to the correct step
    restoring: {
      always: [
        {
          guard: ({ event }) => (event as Extract<WizardEvent, { type: 'RESTORE_STATE' }>).step === 2,
          target: 'step2_titleDescription',
          actions: assign(({ event }) => ({
            ...initialWizardContext,
            ...(event as Extract<WizardEvent, { type: 'RESTORE_STATE' }>).state,
            currentStep: 2,
            error: null,
          })),
        },
        {
          guard: ({ event }) => (event as Extract<WizardEvent, { type: 'RESTORE_STATE' }>).step === 3,
          target: 'step3_smePersonas',
          actions: assign(({ event }) => ({
            ...initialWizardContext,
            ...(event as Extract<WizardEvent, { type: 'RESTORE_STATE' }>).state,
            currentStep: 3,
            error: null,
          })),
        },
        {
          guard: ({ event }) => (event as Extract<WizardEvent, { type: 'RESTORE_STATE' }>).step === 4,
          target: 'step4_audience',
          actions: assign(({ event }) => ({
            ...initialWizardContext,
            ...(event as Extract<WizardEvent, { type: 'RESTORE_STATE' }>).state,
            currentStep: 4,
            error: null,
          })),
        },
        {
          guard: ({ event }) => (event as Extract<WizardEvent, { type: 'RESTORE_STATE' }>).step === 5,
          target: 'step5_toneContext',
          actions: assign(({ event }) => ({
            ...initialWizardContext,
            ...(event as Extract<WizardEvent, { type: 'RESTORE_STATE' }>).state,
            currentStep: 5,
            error: null,
          })),
        },
        {
          // Default: step 1
          target: 'step1_courseName',
          actions: assign(({ event }) => ({
            ...initialWizardContext,
            ...(event as Extract<WizardEvent, { type: 'RESTORE_STATE' }>).state,
            currentStep: 1,
            error: null,
          })),
        },
      ],
    },

    step1_courseName: {
      on: {
        GENERATE_OUTCOMES: 'generatingOutcomes',
        NEXT: 'generatingTitle',
      },
    },

    generatingOutcomes: {
      invoke: {
        id: 'generateOutcomes',
        src: 'generateOutcomesActor',
        input: ({ context }) => ({
          courseName: context.courseName,
          teamDocIds: context.selectedTeamDocIds,
          globalDocIds: context.selectedGlobalDocIds,
        }),
        onDone: {
          target: 'step1_courseName',
          actions: assign({
            desiredOutcomes: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'step1_courseName',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : 'Failed to generate outcomes',
          }),
        },
      },
    },

    generatingTitle: {
      invoke: {
        id: 'generateTitle',
        src: 'generateTitleActor',
        input: ({ context }) => ({
          courseName: context.courseName,
          teamDocIds: context.selectedTeamDocIds,
          globalDocIds: context.selectedGlobalDocIds,
        }),
        onDone: {
          target: 'step2_titleDescription',
          actions: assign({
            improvedTitle: ({ event }) => event.output.improvedTitle,
            description: ({ event }) => event.output.description,
            currentStep: 2,
          }),
        },
        onError: {
          target: 'step1_courseName',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : 'Failed to generate title',
          }),
        },
      },
    },

    step2_titleDescription: {
      on: {
        BACK: {
          target: 'step1_courseName',
          actions: assign({ currentStep: 1 }),
        },
        NEXT: 'generatingPersonas',
      },
    },

    generatingPersonas: {
      invoke: {
        id: 'generateSMEPersonas',
        src: 'generateSMEPersonasActor',
        input: ({ context }) => ({
          title: context.improvedTitle,
          description: context.description,
          teamDocIds: context.selectedTeamDocIds,
          globalDocIds: context.selectedGlobalDocIds,
        }),
        onDone: {
          target: 'step3_smePersonas',
          actions: assign({
            smePersonas: ({ event }) => event.output,
            selectedSmeIds: ({ event }) => event.output.map((p: SMEPersona) => p.id),
            currentStep: 3,
          }),
        },
        onError: {
          target: 'step2_titleDescription',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : 'Failed to generate personas',
          }),
        },
      },
    },

    step3_smePersonas: {
      on: {
        BACK: {
          target: 'step2_titleDescription',
          actions: assign({ currentStep: 2 }),
        },
        REGENERATE: 'generatingPersonas',
        NEXT: {
          guard: ({ context }) => context.selectedSmeIds.length > 0,
          target: 'generatingAudience',
        },
      },
    },

    generatingAudience: {
      invoke: {
        id: 'generateAudiencePersonas',
        src: 'generateAudiencePersonasActor',
        input: ({ context }) => ({
          title: context.improvedTitle,
          description: context.description,
          selectedSmes: context.smePersonas.filter((p) => context.selectedSmeIds.includes(p.id)),
          teamDocIds: context.selectedTeamDocIds,
          globalDocIds: context.selectedGlobalDocIds,
        }),
        onDone: {
          target: 'step4_audience',
          actions: assign({
            audiencePersonas: ({ event }) => event.output,
            selectedAudienceIds: ({ event }) => event.output.map((p: AudiencePersona) => p.id),
            currentStep: 4,
          }),
        },
        onError: {
          target: 'step3_smePersonas',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : 'Failed to generate audience',
          }),
        },
      },
    },

    step4_audience: {
      on: {
        BACK: {
          target: 'step3_smePersonas',
          actions: assign({ currentStep: 3 }),
        },
        REGENERATE: 'generatingAudience',
        NEXT: {
          guard: ({ context }) => context.selectedAudienceIds.length > 0,
          target: 'generatingTone',
        },
      },
    },

    generatingTone: {
      invoke: {
        id: 'generateToneOptions',
        src: 'generateToneOptionsActor',
        input: ({ context }) => ({
          title: context.improvedTitle,
          description: context.description,
          selectedAudiences: context.audiencePersonas.filter((p) => context.selectedAudienceIds.includes(p.id)),
          teamDocIds: context.selectedTeamDocIds,
          globalDocIds: context.selectedGlobalDocIds,
        }),
        onDone: {
          target: 'step5_toneContext',
          actions: assign({
            toneOptions: ({ event }) => event.output,
            selectedToneId: ({ event }) => event.output[0]?.id ?? '',
            currentStep: 5,
          }),
        },
        onError: {
          target: 'step4_audience',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : 'Failed to generate tone options',
          }),
        },
      },
    },

    step5_toneContext: {
      on: {
        BACK: {
          target: 'step4_audience',
          actions: assign({ currentStep: 4 }),
        },
        REGENERATE: 'generatingTone',
        COMPLETE: {
          guard: ({ context }) => context.selectedToneId !== '',
          target: 'completed',
        },
      },
    },

    completed: {
      type: 'final' as const,
    },
  },
});

// ============================================================
// Step name ↔ number helpers
// ============================================================

const STEP_NAMES: Record<number, string> = {
  1: 'courseName',
  2: 'titleDescription',
  3: 'smeSelection',
  4: 'audienceSelection',
  5: 'toneSelection',
};

export function stepNumberToName(step: number): string {
  return STEP_NAMES[step] ?? 'courseName';
}

export function stepNameToNumber(name: string): number {
  const entry = Object.entries(STEP_NAMES).find(([, v]) => v === name);
  return entry ? parseInt(entry[0], 10) : 1;
}

export const TOTAL_WIZARD_STEPS = 5;
