import { createMachine, assign, fromPromise } from 'xstate';
import type {
  SMEPersona,
  AudiencePersona,
  ToneOption,
  WizardStepData,
  WizardState,
} from '@/gen/mirai/v1/course_wizard_pb';
import type { CourseOutline, GenerationJob } from '@/gen/mirai/v1/ai_generation_types_pb';
import type { KnowledgeSource } from '@/gen/mirai/v1/knowledge_source_pb';

/**
 * Pending file to be uploaded after course creation
 */
export interface PendingFile {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
}
import { NetworkError, createAuthError, type AuthError } from './shared/types';

// ============================================================
// Types
// ============================================================

/**
 * Wizard step identifiers matching backend wizard state
 * 5-step wizard:
 * 1. courseName - Enter course name + select knowledge sources via modal + generate outcomes
 * 2. titleDescription - Review AI-generated title/description
 * 3. smeSelection - Select SME personas
 * 4. audienceSelection - Select audience personas
 * 5. toneSelection - Select tone + additional context
 */
export type WizardStep =
  | 'courseName'
  | 'titleDescription'
  | 'smeSelection'
  | 'audienceSelection'
  | 'toneSelection'
  | 'outlineJobQueued';

/**
 * Lightweight knowledge source info for wizard context
 */
export interface WizardKnowledgeSource {
  id: string;
  name: string;
  tokenCount: number;
  summary?: string;
  scope: 'team' | 'global';
}

/**
 * Context for the course wizard state machine
 */
export interface CourseWizardContext {
  // Knowledge Selection (via modal in step 1)
  availableTeamDocs: WizardKnowledgeSource[];
  availableGlobalDocs: WizardKnowledgeSource[];
  selectedTeamDocIds: string[];
  selectedGlobalDocIds: string[];

  // Step 1: Course Name & Desired Outcomes
  courseName: string;
  desiredOutcomes: string;

  // Step 2: AI-improved Title & Description
  improvedTitle: string;
  description: string;

  // Step 3: SME Personas
  smePersonas: SMEPersona[];
  selectedSMEIds: string[];

  // Step 4: Audience Personas
  audiencePersonas: AudiencePersona[];
  selectedAudienceIds: string[];

  // Knowledge Sources (added via modal in step 1)
  pendingFiles: PendingFile[];

  // Internal Data Only mode - when enabled, course content is generated
  // exclusively from uploaded knowledge sources
  internalDataOnly: boolean;

  // Step 5: Tone Options + Additional Context
  toneOptions: ToneOption[];
  selectedToneId: string;
  additionalContext: string;

  // Outline Generation & Review
  outlineJobId: string | null;
  outline: CourseOutline | null;

  // Final: Course Creation
  courseId: string | null;
  courseTitle: string | null;

  // UI State
  currentStep: WizardStep;
  error: AuthError | null;
  flowStartedAt: number | null;

  // Saved state (for resuming)
  savedState: WizardState | null;
}

export type CourseWizardEvent =
  // Knowledge Selection (via modal, available from step 1)
  | { type: 'SET_AVAILABLE_KNOWLEDGE'; teamDocs: WizardKnowledgeSource[]; globalDocs: WizardKnowledgeSource[] }
  | { type: 'TOGGLE_TEAM_DOC'; docId: string }
  | { type: 'TOGGLE_GLOBAL_DOC'; docId: string }
  | { type: 'SELECT_ALL_TEAM_DOCS' }
  | { type: 'DESELECT_ALL_TEAM_DOCS' }
  | { type: 'SELECT_ALL_GLOBAL_DOCS' }
  | { type: 'DESELECT_ALL_GLOBAL_DOCS' }
  // Step 1: Course Name & Outcomes
  | { type: 'SET_COURSE_NAME'; name: string }
  | { type: 'SET_DESIRED_OUTCOMES'; outcomes: string }
  | { type: 'GENERATE_OUTCOMES' }
  | { type: 'SUBMIT_COURSE_NAME' }
  // Step 3: Title/Description
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'APPROVE_TITLE_DESCRIPTION' }
  | { type: 'REGENERATE_TITLE' }
  // Step 4: SME Selection
  | { type: 'TOGGLE_SME'; smeId: string }
  | { type: 'EDIT_SME'; persona: SMEPersona }
  | { type: 'ADD_TEMPLATE_SME'; persona: SMEPersona }
  | { type: 'APPROVE_SMES' }
  | { type: 'REGENERATE_SMES' }
  // Step 5: Audience Selection
  | { type: 'TOGGLE_AUDIENCE'; audienceId: string }
  | { type: 'EDIT_AUDIENCE'; persona: AudiencePersona }
  | { type: 'ADD_TEMPLATE_AUDIENCE'; persona: AudiencePersona }
  | { type: 'APPROVE_AUDIENCES' }
  | { type: 'REGENERATE_AUDIENCES' }
  // Knowledge Sources (available from Step 2 via modal)
  | { type: 'ADD_FILES'; files: PendingFile[] }
  | { type: 'REMOVE_FILE'; fileId: string }
  // Internal Data Only mode
  | { type: 'SET_INTERNAL_DATA_ONLY'; enabled: boolean }
  // Step 6: Tone Selection
  | { type: 'SELECT_TONE'; toneId: string }
  | { type: 'APPROVE_TONE' }
  | { type: 'REGENERATE_TONES' }
  // Additional Context
  | { type: 'SET_ADDITIONAL_CONTEXT'; context: string }
  | { type: 'SUBMIT_CONTEXT' }
  | { type: 'SKIP_CONTEXT' }
  // Outline Job Queued - user dismisses success modal
  | { type: 'DISMISS_SUCCESS' }       // User clicks OK to go to dashboard
  // Navigation
  | { type: 'GO_BACK' }
  | { type: 'CANCEL' }
  // Resume
  | { type: 'LOAD_SAVED_STATE'; state: WizardState }
  | { type: 'RESUME_FROM_STATE' }
  | { type: 'START_FRESH' }
  // Common
  | { type: 'RETRY' }
  | { type: 'DISMISS_ERROR' };

// API Response types
interface GenerateTitleResponse {
  improvedTitle: string;
  description: string;
}

interface GenerateOutcomesResponse {
  outcomes: string;
}

interface GenerateSMEPersonasResponse {
  personas: SMEPersona[];
}

interface GenerateAudiencePersonasResponse {
  personas: AudiencePersona[];
}

interface GenerateToneOptionsResponse {
  options: ToneOption[];
}

interface GenerateOutlineResponse {
  job: GenerationJob;
  courseId: string;
}

interface SaveWizardStateResponse {
  state: WizardState;
}

// ============================================================
// Initial Context
// ============================================================

export const initialContext: CourseWizardContext = {
  // Knowledge Sources (selected via modal in step 1)
  availableTeamDocs: [],
  availableGlobalDocs: [],
  selectedTeamDocIds: [],
  selectedGlobalDocIds: [],
  // Step 1: Course Name
  courseName: '',
  desiredOutcomes: '',
  // Step 2: Title & Description
  improvedTitle: '',
  description: '',
  // Step 3: SME Personas
  smePersonas: [],
  selectedSMEIds: [],
  // Step 4: Audience Personas
  audiencePersonas: [],
  selectedAudienceIds: [],
  // Knowledge sources (uploaded via modal)
  pendingFiles: [],
  internalDataOnly: false,
  // Step 5: Tone
  toneOptions: [],
  selectedToneId: '',
  additionalContext: '',
  // Outline
  outlineJobId: null,
  outline: null,
  // Course
  courseId: null,
  courseTitle: null,
  // UI State
  currentStep: 'courseName',
  error: null,
  flowStartedAt: null,
  savedState: null,
};

// ============================================================
// Actor Definitions
// ============================================================

/**
 * Generate improved title and description
 */
export const generateTitleActor = fromPromise<GenerateTitleResponse, { courseName: string }>(
  async () => {
    throw new NetworkError('generateTitleActor must be provided by the component');
  }
);

/**
 * Generate desired course outcomes
 */
export const generateOutcomesActor = fromPromise<GenerateOutcomesResponse, { courseName: string }>(
  async () => {
    throw new NetworkError('generateOutcomesActor must be provided by the component');
  }
);

/**
 * Generate SME personas
 */
export const generateSMEPersonasActor = fromPromise<
  GenerateSMEPersonasResponse,
  { title: string; description: string }
>(async () => {
  throw new NetworkError('generateSMEPersonasActor must be provided by the component');
});

/**
 * Generate audience personas
 */
export const generateAudiencePersonasActor = fromPromise<
  GenerateAudiencePersonasResponse,
  { title: string; description: string; selectedSmes: SMEPersona[] }
>(async () => {
  throw new NetworkError('generateAudiencePersonasActor must be provided by the component');
});

/**
 * Generate tone options
 */
export const generateToneOptionsActor = fromPromise<
  GenerateToneOptionsResponse,
  { title: string; description: string; selectedAudiences: AudiencePersona[] }
>(async () => {
  throw new NetworkError('generateToneOptionsActor must be provided by the component');
});

/**
 * Generate course outline (starts async job)
 */
export const generateOutlineActor = fromPromise<
  GenerateOutlineResponse,
  {
    title: string;
    description: string;
    smePersonas: SMEPersona[];
    audiencePersonas: AudiencePersona[];
    toneOption: ToneOption | undefined;
    additionalContext: string;
    internalDataOnly: boolean;
    selectedTeamDocIds: string[];
    selectedGlobalDocIds: string[];
  }
>(async () => {
  throw new NetworkError('generateOutlineActor must be provided by the component');
});

// Note: pollOutlineJobActor, getOutlineActor, and createCourseActor removed
// The wizard now redirects to the outline review page after starting outline generation

/**
 * Save wizard state to backend
 */
export const saveWizardStateActor = fromPromise<
  SaveWizardStateResponse,
  { currentStep: string; data: Partial<WizardStepData> }
>(async () => {
  throw new NetworkError('saveWizardStateActor must be provided by the component');
});

/**
 * Delete wizard state from backend
 */
export const deleteWizardStateActor = fromPromise<void, void>(async () => {
  throw new NetworkError('deleteWizardStateActor must be provided by the component');
});

// ============================================================
// Machine Definition
// ============================================================

export const courseWizardMachine = createMachine({
  id: 'courseWizard',
  initial: 'checkingSavedState',
  context: initialContext,
  types: {} as {
    context: CourseWizardContext;
    events: CourseWizardEvent;
  },
  states: {
    // --------------------------------------------------------
    // Check for saved state to potentially resume
    // --------------------------------------------------------
    checkingSavedState: {
      on: {
        LOAD_SAVED_STATE: {
          target: 'promptResume',
          actions: assign({
            savedState: ({ event }) => event.state,
          }),
        },
        START_FRESH: {
          target: 'courseName',
          actions: assign({
            flowStartedAt: () => Date.now(),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Prompt user to resume or start fresh
    // --------------------------------------------------------
    promptResume: {
      on: {
        RESUME_FROM_STATE: {
          target: 'resuming',
        },
        START_FRESH: {
          target: 'courseName',
          actions: assign({
            ...initialContext,
            flowStartedAt: () => Date.now(),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Resume from saved state
    // --------------------------------------------------------
    resuming: {
      always: [
        {
          target: 'courseName',
          guard: ({ context }) => context.savedState?.currentStep === 'courseName',
          actions: assign(({ context }) => ({
            selectedTeamDocIds: context.savedState?.data?.selectedTeamDocIds ?? [],
            selectedGlobalDocIds: context.savedState?.data?.selectedGlobalDocIds ?? [],
            courseName: context.savedState?.data?.courseName ?? '',
            desiredOutcomes: context.savedState?.data?.desiredOutcomes ?? '',
            currentStep: 'courseName' as const,
            flowStartedAt: Date.now(),
          })),
        },
        {
          target: 'titleDescription',
          guard: ({ context }) => context.savedState?.currentStep === 'titleDescription',
          actions: assign(({ context }) => ({
            selectedTeamDocIds: context.savedState?.data?.selectedTeamDocIds ?? [],
            selectedGlobalDocIds: context.savedState?.data?.selectedGlobalDocIds ?? [],
            courseName: context.savedState?.data?.courseName ?? '',
            desiredOutcomes: context.savedState?.data?.desiredOutcomes ?? '',
            improvedTitle: context.savedState?.data?.improvedTitle ?? '',
            description: context.savedState?.data?.description ?? '',
            currentStep: 'titleDescription' as const,
            flowStartedAt: Date.now(),
          })),
        },
        {
          target: 'smeSelection',
          guard: ({ context }) => context.savedState?.currentStep === 'smeSelection',
          actions: assign(({ context }) => ({
            selectedTeamDocIds: context.savedState?.data?.selectedTeamDocIds ?? [],
            selectedGlobalDocIds: context.savedState?.data?.selectedGlobalDocIds ?? [],
            courseName: context.savedState?.data?.courseName ?? '',
            desiredOutcomes: context.savedState?.data?.desiredOutcomes ?? '',
            improvedTitle: context.savedState?.data?.improvedTitle ?? '',
            description: context.savedState?.data?.description ?? '',
            smePersonas: context.savedState?.data?.smePersonas ?? [],
            selectedSMEIds: context.savedState?.data?.selectedSmeIds ?? [],
            currentStep: 'smeSelection' as const,
            flowStartedAt: Date.now(),
          })),
        },
        {
          target: 'audienceSelection',
          guard: ({ context }) => context.savedState?.currentStep === 'audienceSelection',
          actions: assign(({ context }) => ({
            selectedTeamDocIds: context.savedState?.data?.selectedTeamDocIds ?? [],
            selectedGlobalDocIds: context.savedState?.data?.selectedGlobalDocIds ?? [],
            courseName: context.savedState?.data?.courseName ?? '',
            desiredOutcomes: context.savedState?.data?.desiredOutcomes ?? '',
            improvedTitle: context.savedState?.data?.improvedTitle ?? '',
            description: context.savedState?.data?.description ?? '',
            smePersonas: context.savedState?.data?.smePersonas ?? [],
            selectedSMEIds: context.savedState?.data?.selectedSmeIds ?? [],
            audiencePersonas: context.savedState?.data?.audiencePersonas ?? [],
            selectedAudienceIds: context.savedState?.data?.selectedAudienceIds ?? [],
            currentStep: 'audienceSelection' as const,
            flowStartedAt: Date.now(),
          })),
        },
        {
          target: 'toneSelection',
          guard: ({ context }) => context.savedState?.currentStep === 'toneSelection',
          actions: assign(({ context }) => ({
            selectedTeamDocIds: context.savedState?.data?.selectedTeamDocIds ?? [],
            selectedGlobalDocIds: context.savedState?.data?.selectedGlobalDocIds ?? [],
            courseName: context.savedState?.data?.courseName ?? '',
            desiredOutcomes: context.savedState?.data?.desiredOutcomes ?? '',
            improvedTitle: context.savedState?.data?.improvedTitle ?? '',
            description: context.savedState?.data?.description ?? '',
            smePersonas: context.savedState?.data?.smePersonas ?? [],
            selectedSMEIds: context.savedState?.data?.selectedSmeIds ?? [],
            audiencePersonas: context.savedState?.data?.audiencePersonas ?? [],
            selectedAudienceIds: context.savedState?.data?.selectedAudienceIds ?? [],
            toneOptions: context.savedState?.data?.toneOptions ?? [],
            selectedToneId: context.savedState?.data?.selectedToneId ?? '',
            currentStep: 'toneSelection' as const,
            flowStartedAt: Date.now(),
          })),
        },
        {
          // Default: start from beginning
          target: 'courseName',
          actions: assign({
            flowStartedAt: () => Date.now(),
          }),
        },
      ],
    },

    // --------------------------------------------------------
    // Step 1: Course Name Entry
    // Knowledge sources are selected via modal (not a separate step)
    // --------------------------------------------------------
    courseName: {
      entry: assign({
        currentStep: 'courseName' as const,
      }),
      on: {
        // Knowledge source selection (triggered from modal)
        SET_AVAILABLE_KNOWLEDGE: {
          actions: assign({
            availableTeamDocs: ({ event }) => event.teamDocs,
            availableGlobalDocs: ({ event }) => event.globalDocs,
            // Pre-select all available sources by default
            selectedTeamDocIds: ({ event }) => event.teamDocs.map((d) => d.id),
            selectedGlobalDocIds: ({ event }) => event.globalDocs.map((d) => d.id),
          }),
        },
        TOGGLE_TEAM_DOC: {
          actions: assign({
            selectedTeamDocIds: ({ context, event }) =>
              context.selectedTeamDocIds.includes(event.docId)
                ? context.selectedTeamDocIds.filter((id) => id !== event.docId)
                : [...context.selectedTeamDocIds, event.docId],
          }),
        },
        TOGGLE_GLOBAL_DOC: {
          actions: assign({
            selectedGlobalDocIds: ({ context, event }) =>
              context.selectedGlobalDocIds.includes(event.docId)
                ? context.selectedGlobalDocIds.filter((id) => id !== event.docId)
                : [...context.selectedGlobalDocIds, event.docId],
          }),
        },
        SELECT_ALL_TEAM_DOCS: {
          actions: assign({
            selectedTeamDocIds: ({ context }) => context.availableTeamDocs.map((d) => d.id),
          }),
        },
        DESELECT_ALL_TEAM_DOCS: {
          actions: assign({
            selectedTeamDocIds: () => [],
          }),
        },
        SELECT_ALL_GLOBAL_DOCS: {
          actions: assign({
            selectedGlobalDocIds: ({ context }) => context.availableGlobalDocs.map((d) => d.id),
          }),
        },
        DESELECT_ALL_GLOBAL_DOCS: {
          actions: assign({
            selectedGlobalDocIds: () => [],
          }),
        },
        // Course name events
        SET_COURSE_NAME: {
          actions: assign({
            courseName: ({ event }) => event.name,
            error: null,
          }),
        },
        SET_DESIRED_OUTCOMES: {
          actions: assign({
            desiredOutcomes: ({ event }) => event.outcomes,
          }),
        },
        // Knowledge sources (added via modal)
        ADD_FILES: {
          actions: assign({
            pendingFiles: ({ context, event }) => [...context.pendingFiles, ...event.files],
          }),
        },
        REMOVE_FILE: {
          actions: assign({
            pendingFiles: ({ context, event }) =>
              context.pendingFiles.filter((f) => f.id !== event.fileId),
          }),
        },
        SET_INTERNAL_DATA_ONLY: {
          actions: assign({
            internalDataOnly: ({ event }) => event.enabled,
          }),
        },
        GENERATE_OUTCOMES: {
          target: 'generatingOutcomes',
          guard: ({ context }) => context.courseName.trim().length > 0,
        },
        SUBMIT_COURSE_NAME: {
          target: 'generatingTitle',
          guard: ({ context }) => context.courseName.trim().length > 0,
        },
        CANCEL: 'cancelled',
      },
    },

    // --------------------------------------------------------
    // Generating Outcomes (AI) - Magic wand
    // --------------------------------------------------------
    generatingOutcomes: {
      invoke: {
        id: 'generateOutcomes',
        src: 'generateOutcomesActor',
        input: ({ context }) => ({ courseName: context.courseName }),
        onDone: {
          target: 'courseName',
          actions: assign({
            desiredOutcomes: ({ event }) => event.output.outcomes,
            error: null,
          }),
        },
        onError: {
          target: 'courseName',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error ? event.error.message : 'Failed to generate outcomes',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Generating Title (AI)
    // --------------------------------------------------------
    generatingTitle: {
      invoke: {
        id: 'generateTitle',
        src: 'generateTitleActor',
        input: ({ context }) => ({ courseName: context.courseName }),
        onDone: {
          target: 'titleDescription',
          actions: assign({
            improvedTitle: ({ event }) => event.output.improvedTitle,
            description: ({ event }) => event.output.description,
            error: null,
          }),
        },
        onError: {
          target: 'courseName',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error ? event.error.message : 'Failed to generate title',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Step 3: Title & Description Review
    // --------------------------------------------------------
    titleDescription: {
      entry: assign({
        currentStep: 'titleDescription' as const,
      }),
      on: {
        SET_TITLE: {
          actions: assign({
            improvedTitle: ({ event }) => event.title,
          }),
        },
        SET_DESCRIPTION: {
          actions: assign({
            description: ({ event }) => event.description,
          }),
        },
        APPROVE_TITLE_DESCRIPTION: {
          target: 'generatingSMEs',
          guard: ({ context }) =>
            context.improvedTitle.trim().length > 0 && context.description.trim().length > 0,
        },
        REGENERATE_TITLE: 'generatingTitle',
        GO_BACK: 'courseName',
        CANCEL: 'cancelled',
      },
    },

    // --------------------------------------------------------
    // Generating SME Personas (AI)
    // --------------------------------------------------------
    generatingSMEs: {
      invoke: {
        id: 'generateSMEPersonas',
        src: 'generateSMEPersonasActor',
        input: ({ context }) => ({
          title: context.improvedTitle,
          description: context.description,
        }),
        onDone: {
          target: 'smeSelection',
          actions: assign({
            smePersonas: ({ event }) => event.output.personas,
            // Auto-select all personas by default
            selectedSMEIds: ({ event }) => event.output.personas.map((p: SMEPersona) => p.id),
            error: null,
          }),
        },
        onError: {
          target: 'titleDescription',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error ? event.error.message : 'Failed to generate SME personas',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Step 4: SME Persona Selection
    // --------------------------------------------------------
    smeSelection: {
      entry: assign({
        currentStep: 'smeSelection' as const,
      }),
      on: {
        TOGGLE_SME: {
          actions: assign({
            selectedSMEIds: ({ context, event }) =>
              context.selectedSMEIds.includes(event.smeId)
                ? context.selectedSMEIds.filter((id) => id !== event.smeId)
                : [...context.selectedSMEIds, event.smeId],
          }),
        },
        EDIT_SME: {
          actions: assign({
            smePersonas: ({ context, event }) =>
              context.smePersonas.map((p) => (p.id === event.persona.id ? event.persona : p)),
          }),
        },
        ADD_TEMPLATE_SME: {
          actions: assign({
            smePersonas: ({ context, event }) => {
              // Don't add if already present
              if (context.smePersonas.some((p) => p.id === event.persona.id)) {
                return context.smePersonas;
              }
              return [...context.smePersonas, event.persona];
            },
            selectedSMEIds: ({ context, event }) => {
              // Auto-select the added template
              if (context.selectedSMEIds.includes(event.persona.id)) {
                return context.selectedSMEIds;
              }
              return [...context.selectedSMEIds, event.persona.id];
            },
          }),
        },
        APPROVE_SMES: {
          target: 'generatingAudiences',
          guard: ({ context }) => context.selectedSMEIds.length > 0,
        },
        REGENERATE_SMES: 'generatingSMEs',
        GO_BACK: 'titleDescription',
        CANCEL: 'cancelled',
      },
    },

    // --------------------------------------------------------
    // Generating Audience Personas (AI)
    // --------------------------------------------------------
    generatingAudiences: {
      invoke: {
        id: 'generateAudiencePersonas',
        src: 'generateAudiencePersonasActor',
        input: ({ context }) => ({
          title: context.improvedTitle,
          description: context.description,
          selectedSmes: context.smePersonas.filter((p) => context.selectedSMEIds.includes(p.id)),
        }),
        onDone: {
          target: 'audienceSelection',
          actions: assign({
            audiencePersonas: ({ event }) => event.output.personas,
            // Auto-select all personas by default
            selectedAudienceIds: ({ event }) => event.output.personas.map((p: AudiencePersona) => p.id),
            error: null,
          }),
        },
        onError: {
          target: 'smeSelection',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error
                  ? event.error.message
                  : 'Failed to generate audience personas',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Step 5: Audience Persona Selection
    // --------------------------------------------------------
    audienceSelection: {
      entry: assign({
        currentStep: 'audienceSelection' as const,
      }),
      on: {
        TOGGLE_AUDIENCE: {
          actions: assign({
            selectedAudienceIds: ({ context, event }) =>
              context.selectedAudienceIds.includes(event.audienceId)
                ? context.selectedAudienceIds.filter((id) => id !== event.audienceId)
                : [...context.selectedAudienceIds, event.audienceId],
          }),
        },
        EDIT_AUDIENCE: {
          actions: assign({
            audiencePersonas: ({ context, event }) =>
              context.audiencePersonas.map((p) => (p.id === event.persona.id ? event.persona : p)),
          }),
        },
        ADD_TEMPLATE_AUDIENCE: {
          actions: assign({
            audiencePersonas: ({ context, event }) => {
              // Don't add if already present
              if (context.audiencePersonas.some((p) => p.id === event.persona.id)) {
                return context.audiencePersonas;
              }
              return [...context.audiencePersonas, event.persona];
            },
            selectedAudienceIds: ({ context, event }) => {
              // Auto-select the added template
              if (context.selectedAudienceIds.includes(event.persona.id)) {
                return context.selectedAudienceIds;
              }
              return [...context.selectedAudienceIds, event.persona.id];
            },
          }),
        },
        APPROVE_AUDIENCES: {
          target: 'generatingTones',
          guard: ({ context }) => context.selectedAudienceIds.length > 0,
        },
        REGENERATE_AUDIENCES: 'generatingAudiences',
        GO_BACK: 'smeSelection',
        CANCEL: 'cancelled',
      },
    },

    // --------------------------------------------------------
    // Generating Tone Options (AI)
    // --------------------------------------------------------
    generatingTones: {
      invoke: {
        id: 'generateToneOptions',
        src: 'generateToneOptionsActor',
        input: ({ context }) => ({
          title: context.improvedTitle,
          description: context.description,
          selectedAudiences: context.audiencePersonas.filter((p) =>
            context.selectedAudienceIds.includes(p.id)
          ),
        }),
        onDone: {
          target: 'toneSelection',
          actions: assign({
            toneOptions: ({ event }) => event.output.options,
            // Select first tone by default
            selectedToneId: ({ event }) => event.output.options[0]?.id ?? '',
            error: null,
          }),
        },
        onError: {
          target: 'audienceSelection',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error
                  ? event.error.message
                  : 'Failed to generate tone options',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Step 6: Tone Selection + Additional Context (merged)
    // --------------------------------------------------------
    toneSelection: {
      entry: assign({
        currentStep: 'toneSelection' as const,
      }),
      on: {
        SELECT_TONE: {
          actions: assign({
            selectedToneId: ({ event }) => event.toneId,
          }),
        },
        SET_ADDITIONAL_CONTEXT: {
          actions: assign({
            additionalContext: ({ event }) => event.context,
          }),
        },
        APPROVE_TONE: {
          target: 'generatingOutline',
          guard: ({ context }) => context.selectedToneId.length > 0,
        },
        SUBMIT_CONTEXT: {
          target: 'generatingOutline',
          guard: ({ context }) => context.selectedToneId.length > 0,
        },
        SKIP_CONTEXT: {
          target: 'generatingOutline',
          guard: ({ context }) => context.selectedToneId.length > 0,
          actions: assign({
            additionalContext: '',
          }),
        },
        REGENERATE_TONES: 'generatingTones',
        GO_BACK: 'audienceSelection',
        CANCEL: 'cancelled',
      },
    },

    // --------------------------------------------------------
    // Generating Outline (Async Job) - Just submit, don't poll
    // --------------------------------------------------------
    generatingOutline: {
      invoke: {
        id: 'generateOutline',
        src: 'generateOutlineActor',
        input: ({ context }) => ({
          title: context.improvedTitle,
          description: context.description,
          smePersonas: context.smePersonas.filter((p) => context.selectedSMEIds.includes(p.id)),
          audiencePersonas: context.audiencePersonas.filter((p) =>
            context.selectedAudienceIds.includes(p.id)
          ),
          toneOption: context.toneOptions.find((t) => t.id === context.selectedToneId),
          additionalContext: context.additionalContext,
          internalDataOnly: context.internalDataOnly,
          selectedTeamDocIds: context.selectedTeamDocIds,
          selectedGlobalDocIds: context.selectedGlobalDocIds,
        }),
        onDone: {
          target: 'outlineJobQueued',
          actions: assign({
            outlineJobId: ({ event }) => event.output.job.id,
            courseId: ({ event }) => event.output.courseId,
          }),
        },
        onError: {
          target: 'toneSelection',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error
                  ? event.error.message
                  : 'Failed to start outline generation',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Outline Job Queued - Show success, user clicks OK to redirect
    // --------------------------------------------------------
    outlineJobQueued: {
      entry: assign({
        currentStep: 'outlineJobQueued' as const,
      }),
      on: {
        DISMISS_SUCCESS: 'redirectToDashboard',
      },
    },

    // --------------------------------------------------------
    // Redirect to Dashboard (background generation)
    // --------------------------------------------------------
    redirectToDashboard: {
      type: 'final' as const,
    },

    // --------------------------------------------------------
    // Complete - Course created successfully
    // --------------------------------------------------------
    complete: {
      type: 'final' as const,
    },

    // --------------------------------------------------------
    // Cancelled - User cancelled the wizard
    // --------------------------------------------------------
    cancelled: {
      type: 'final' as const,
    },
  },
  on: {
    DISMISS_ERROR: {
      actions: assign({ error: null }),
    },
    RETRY: {
      actions: assign({ error: null }),
    },
  },
});

// ============================================================
// Helper functions
// ============================================================

/**
 * Get step number (1-5) from step identifier
 * Note: outlineJobQueued is a confirmation screen, not a wizard step
 */
export function getStepNumber(step: WizardStep): number {
  const stepMap: Record<WizardStep, number> = {
    courseName: 1,
    titleDescription: 2,
    smeSelection: 3,
    audienceSelection: 4,
    toneSelection: 5,
    outlineJobQueued: 5, // Same as toneSelection since it's a confirmation
  };
  return stepMap[step];
}

/**
 * Get human-readable step label
 */
export function getStepLabel(step: WizardStep): string {
  const labelMap: Record<WizardStep, string> = {
    courseName: 'Course Name',
    titleDescription: 'Title & Description',
    smeSelection: 'SME Personas',
    audienceSelection: 'Target Audience',
    toneSelection: 'Tone & Context',
    outlineJobQueued: 'Generation Started',
  };
  return labelMap[step];
}

/**
 * Get all steps in order (excluding confirmation states)
 */
export function getAllSteps(): WizardStep[] {
  return [
    'courseName',
    'titleDescription',
    'smeSelection',
    'audienceSelection',
    'toneSelection',
  ];
}

/**
 * Check if machine is in a generating/loading state
 */
export function isGenerating(stateValue: unknown): boolean {
  if (typeof stateValue === 'string') {
    return [
      'generatingOutcomes',
      'generatingTitle',
      'generatingSMEs',
      'generatingAudiences',
      'generatingTones',
      'generatingOutline',
    ].includes(stateValue);
  }
  return false;
}

/**
 * Check if can go back from current state
 */
export function canGoBack(stateValue: unknown): boolean {
  if (typeof stateValue === 'string') {
    return !['courseName', 'checkingSavedState', 'promptResume', 'resuming', 'complete', 'cancelled'].includes(
      stateValue
    );
  }
  return false;
}

/**
 * Build WizardStepData from context for saving
 */
export function buildWizardStepData(context: CourseWizardContext): Partial<WizardStepData> {
  return {
    courseName: context.courseName,
    desiredOutcomes: context.desiredOutcomes,
    improvedTitle: context.improvedTitle,
    description: context.description,
    smePersonas: context.smePersonas,
    selectedSmeIds: context.selectedSMEIds,
    audiencePersonas: context.audiencePersonas,
    selectedAudienceIds: context.selectedAudienceIds,
    toneOptions: context.toneOptions,
    selectedToneId: context.selectedToneId,
    additionalContext: context.additionalContext,
    internalDataOnly: context.internalDataOnly,
    selectedTeamDocIds: context.selectedTeamDocIds,
    selectedGlobalDocIds: context.selectedGlobalDocIds,
  };
}

/**
 * Calculate total selected tokens
 */
export function getSelectedTokenCount(context: CourseWizardContext): {
  teamTokens: number;
  globalTokens: number;
  totalTokens: number;
} {
  const teamTokens = context.availableTeamDocs
    .filter((doc) => context.selectedTeamDocIds.includes(doc.id))
    .reduce((sum, doc) => sum + doc.tokenCount, 0);

  const globalTokens = context.availableGlobalDocs
    .filter((doc) => context.selectedGlobalDocIds.includes(doc.id))
    .reduce((sum, doc) => sum + doc.tokenCount, 0);

  return {
    teamTokens,
    globalTokens,
    totalTokens: teamTokens + globalTokens,
  };
}
