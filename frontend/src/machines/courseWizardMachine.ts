import { createMachine, assign, fromPromise } from 'xstate';
import type {
  SMEPersona,
  AudiencePersona,
  ToneOption,
  WizardStepData,
  WizardState,
} from '@/gen/mirai/v1/course_wizard_pb';
import type { CourseOutline, GenerationJob } from '@/gen/mirai/v1/ai_generation_pb';
import { NetworkError, createAuthError, type AuthError } from './shared/types';

// ============================================================
// Types
// ============================================================

/**
 * Wizard step identifiers matching backend wizard state
 */
export type WizardStep =
  | 'courseName'
  | 'titleDescription'
  | 'smeSelection'
  | 'audienceSelection'
  | 'toneSelection'
  | 'additionalContext'
  | 'outlineJobQueued';

/**
 * Context for the course wizard state machine
 */
export interface CourseWizardContext {
  // Step 1: Course Name
  courseName: string;

  // Step 2: AI-improved Title & Description
  improvedTitle: string;
  description: string;

  // Step 3: SME Personas
  smePersonas: SMEPersona[];
  selectedSMEIds: string[];

  // Step 4: Audience Personas
  audiencePersonas: AudiencePersona[];
  selectedAudienceIds: string[];

  // Step 5: Tone Options
  toneOptions: ToneOption[];
  selectedToneId: string;

  // Step 6: Additional Context
  additionalContext: string;

  // Step 7: Outline Generation & Review
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
  // Step 1: Course Name
  | { type: 'SET_COURSE_NAME'; name: string }
  | { type: 'SUBMIT_COURSE_NAME' }
  // Step 2: Title/Description
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'APPROVE_TITLE_DESCRIPTION' }
  | { type: 'REGENERATE_TITLE' }
  // Step 3: SME Selection
  | { type: 'TOGGLE_SME'; smeId: string }
  | { type: 'EDIT_SME'; persona: SMEPersona }
  | { type: 'APPROVE_SMES' }
  | { type: 'REGENERATE_SMES' }
  // Step 4: Audience Selection
  | { type: 'TOGGLE_AUDIENCE'; audienceId: string }
  | { type: 'EDIT_AUDIENCE'; persona: AudiencePersona }
  | { type: 'APPROVE_AUDIENCES' }
  | { type: 'REGENERATE_AUDIENCES' }
  // Step 5: Tone Selection
  | { type: 'SELECT_TONE'; toneId: string }
  | { type: 'APPROVE_TONE' }
  | { type: 'REGENERATE_TONES' }
  // Step 6: Additional Context
  | { type: 'SET_ADDITIONAL_CONTEXT'; context: string }
  | { type: 'SUBMIT_CONTEXT' }
  | { type: 'SKIP_CONTEXT' }
  // Step 7: Outline Job Queued - user dismisses success modal
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
  courseName: '',
  improvedTitle: '',
  description: '',
  smePersonas: [],
  selectedSMEIds: [],
  audiencePersonas: [],
  selectedAudienceIds: [],
  toneOptions: [],
  selectedToneId: '',
  additionalContext: '',
  outlineJobId: null,
  outline: null,
  courseId: null,
  courseTitle: null,
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
          target: 'titleDescription',
          guard: ({ context }) => context.savedState?.currentStep === 'titleDescription',
          actions: assign(({ context }) => ({
            courseName: context.savedState?.data?.courseName ?? '',
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
            courseName: context.savedState?.data?.courseName ?? '',
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
            courseName: context.savedState?.data?.courseName ?? '',
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
            courseName: context.savedState?.data?.courseName ?? '',
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
          target: 'additionalContext',
          guard: ({ context }) => context.savedState?.currentStep === 'additionalContext',
          actions: assign(({ context }) => ({
            courseName: context.savedState?.data?.courseName ?? '',
            improvedTitle: context.savedState?.data?.improvedTitle ?? '',
            description: context.savedState?.data?.description ?? '',
            smePersonas: context.savedState?.data?.smePersonas ?? [],
            selectedSMEIds: context.savedState?.data?.selectedSmeIds ?? [],
            audiencePersonas: context.savedState?.data?.audiencePersonas ?? [],
            selectedAudienceIds: context.savedState?.data?.selectedAudienceIds ?? [],
            toneOptions: context.savedState?.data?.toneOptions ?? [],
            selectedToneId: context.savedState?.data?.selectedToneId ?? '',
            additionalContext: context.savedState?.data?.additionalContext ?? '',
            currentStep: 'additionalContext' as const,
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
    // --------------------------------------------------------
    courseName: {
      entry: assign({
        currentStep: 'courseName' as const,
      }),
      on: {
        SET_COURSE_NAME: {
          actions: assign({
            courseName: ({ event }) => event.name,
            error: null,
          }),
        },
        SUBMIT_COURSE_NAME: {
          target: 'generatingTitle',
          guard: ({ context }) => context.courseName.trim().length > 0,
        },
        CANCEL: 'cancelled',
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
    // Step 2: Title & Description Review
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
    // Step 3: SME Persona Selection
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
    // Step 4: Audience Persona Selection
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
    // Step 5: Tone Selection
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
        APPROVE_TONE: {
          target: 'additionalContext',
          guard: ({ context }) => context.selectedToneId.length > 0,
        },
        REGENERATE_TONES: 'generatingTones',
        GO_BACK: 'audienceSelection',
        CANCEL: 'cancelled',
      },
    },

    // --------------------------------------------------------
    // Step 6: Additional Context (Optional)
    // --------------------------------------------------------
    additionalContext: {
      entry: assign({
        currentStep: 'additionalContext' as const,
      }),
      on: {
        SET_ADDITIONAL_CONTEXT: {
          actions: assign({
            additionalContext: ({ event }) => event.context,
          }),
        },
        SUBMIT_CONTEXT: 'generatingOutline',
        SKIP_CONTEXT: {
          target: 'generatingOutline',
          actions: assign({
            additionalContext: '',
          }),
        },
        GO_BACK: 'toneSelection',
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
        }),
        onDone: {
          target: 'outlineJobQueued',
          actions: assign({
            outlineJobId: ({ event }) => event.output.job.id,
            courseId: ({ event }) => event.output.courseId,
          }),
        },
        onError: {
          target: 'additionalContext',
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
    // Step 7: Outline Job Queued - Show success, user clicks OK to redirect
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
 * Get step number (1-6) from step identifier
 * Note: Step 7 (outlineJobQueued) is a confirmation screen, not a wizard step
 */
export function getStepNumber(step: WizardStep): number {
  const stepMap: Record<WizardStep, number> = {
    courseName: 1,
    titleDescription: 2,
    smeSelection: 3,
    audienceSelection: 4,
    toneSelection: 5,
    additionalContext: 6,
    outlineJobQueued: 6, // Same as additionalContext since it's a confirmation
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
    toneSelection: 'Tone & Style',
    additionalContext: 'Additional Context',
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
    'additionalContext',
  ];
}

/**
 * Check if machine is in a generating/loading state
 */
export function isGenerating(stateValue: unknown): boolean {
  if (typeof stateValue === 'string') {
    return [
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
    improvedTitle: context.improvedTitle,
    description: context.description,
    smePersonas: context.smePersonas,
    selectedSmeIds: context.selectedSMEIds,
    audiencePersonas: context.audiencePersonas,
    selectedAudienceIds: context.selectedAudienceIds,
    toneOptions: context.toneOptions,
    selectedToneId: context.selectedToneId,
    additionalContext: context.additionalContext,
  };
}
