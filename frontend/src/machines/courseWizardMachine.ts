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
  | 'outlineReview';

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
  // Step 7: Outline
  | { type: 'POLL_OUTLINE' }
  | { type: 'APPROVE_OUTLINE' }
  | { type: 'REGENERATE_OUTLINE' }
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
}

interface GetJobResponse {
  job: GenerationJob;
}

interface GetOutlineResponse {
  outline: CourseOutline;
}

interface CreateCourseResponse {
  courseId: string;
  courseTitle: string;
}

interface SaveWizardStateResponse {
  state: WizardState;
}

// Job status constants
const JOB_STATUS = {
  UNSPECIFIED: 0,
  QUEUED: 1,
  PROCESSING: 2,
  COMPLETED: 3,
  FAILED: 4,
  CANCELLED: 5,
} as const;

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

/**
 * Poll outline job status
 */
export const pollOutlineJobActor = fromPromise<GetJobResponse, { jobId: string }>(async () => {
  throw new NetworkError('pollOutlineJobActor must be provided by the component');
});

/**
 * Fetch generated outline
 */
export const getOutlineActor = fromPromise<GetOutlineResponse, { jobId: string }>(async () => {
  throw new NetworkError('getOutlineActor must be provided by the component');
});

/**
 * Create course from approved outline
 */
export const createCourseActor = fromPromise<
  CreateCourseResponse,
  { outlineId: string; wizardData: Partial<WizardStepData> }
>(async () => {
  throw new NetworkError('createCourseActor must be provided by the component');
});

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
    // Generating Outline (Async Job)
    // --------------------------------------------------------
    generatingOutline: {
      initial: 'submitting',
      states: {
        submitting: {
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
              target: 'polling',
              actions: assign({
                outlineJobId: ({ event }) => event.output.job.id,
              }),
            },
            onError: {
              target: '#courseWizard.additionalContext',
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
        polling: {
          invoke: {
            id: 'pollOutlineJob',
            src: 'pollOutlineJobActor',
            input: ({ context }) => ({ jobId: context.outlineJobId! }),
            onDone: [
              {
                target: 'fetchingOutline',
                guard: ({ event }) => event.output.job.status === JOB_STATUS.COMPLETED,
              },
              {
                target: '#courseWizard.additionalContext',
                guard: ({ event }) => event.output.job.status === JOB_STATUS.FAILED,
                actions: assign({
                  error: ({ event }) =>
                    createAuthError(
                      'NETWORK_ERROR',
                      event.output.job.errorMessage || 'Outline generation failed',
                      true
                    ),
                }),
              },
              {
                target: 'waiting',
              },
            ],
            onError: {
              target: '#courseWizard.additionalContext',
              actions: assign({
                error: ({ event }) =>
                  createAuthError(
                    'NETWORK_ERROR',
                    event.error instanceof Error ? event.error.message : 'Failed to poll job status',
                    true
                  ),
              }),
            },
          },
        },
        waiting: {
          after: {
            3000: 'polling',
          },
          on: {
            CANCEL: '#courseWizard.additionalContext',
          },
        },
        fetchingOutline: {
          invoke: {
            id: 'getOutline',
            src: 'getOutlineActor',
            input: ({ context }) => ({ jobId: context.outlineJobId! }),
            onDone: {
              target: '#courseWizard.outlineReview',
              actions: assign({
                outline: ({ event }) => event.output.outline,
                error: null,
              }),
            },
            onError: {
              target: '#courseWizard.additionalContext',
              actions: assign({
                error: ({ event }) =>
                  createAuthError(
                    'NETWORK_ERROR',
                    event.error instanceof Error ? event.error.message : 'Failed to fetch outline',
                    true
                  ),
              }),
            },
          },
        },
      },
    },

    // --------------------------------------------------------
    // Step 7: Outline Review
    // --------------------------------------------------------
    outlineReview: {
      entry: assign({
        currentStep: 'outlineReview' as const,
      }),
      on: {
        APPROVE_OUTLINE: 'creatingCourse',
        REGENERATE_OUTLINE: 'generatingOutline',
        GO_BACK: 'additionalContext',
        CANCEL: 'cancelled',
      },
    },

    // --------------------------------------------------------
    // Creating Course from Outline
    // --------------------------------------------------------
    creatingCourse: {
      invoke: {
        id: 'createCourse',
        src: 'createCourseActor',
        input: ({ context }) => ({
          outlineId: context.outline!.id,
          wizardData: {
            courseName: context.courseName,
            improvedTitle: context.improvedTitle,
            description: context.description,
            smePersonas: context.smePersonas.filter((p) => context.selectedSMEIds.includes(p.id)),
            selectedSmeIds: context.selectedSMEIds,
            audiencePersonas: context.audiencePersonas.filter((p) =>
              context.selectedAudienceIds.includes(p.id)
            ),
            selectedAudienceIds: context.selectedAudienceIds,
            toneOptions: [context.toneOptions.find((t) => t.id === context.selectedToneId)!],
            selectedToneId: context.selectedToneId,
            additionalContext: context.additionalContext,
          },
        }),
        onDone: {
          target: 'complete',
          actions: assign({
            courseId: ({ event }) => event.output.courseId,
            courseTitle: ({ event }) => event.output.courseTitle,
            error: null,
          }),
        },
        onError: {
          target: 'outlineReview',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error ? event.error.message : 'Failed to create course',
                true
              ),
          }),
        },
      },
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
 * Get step number (1-7) from step identifier
 */
export function getStepNumber(step: WizardStep): number {
  const stepMap: Record<WizardStep, number> = {
    courseName: 1,
    titleDescription: 2,
    smeSelection: 3,
    audienceSelection: 4,
    toneSelection: 5,
    additionalContext: 6,
    outlineReview: 7,
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
    outlineReview: 'Review Outline',
  };
  return labelMap[step];
}

/**
 * Get all steps in order
 */
export function getAllSteps(): WizardStep[] {
  return [
    'courseName',
    'titleDescription',
    'smeSelection',
    'audienceSelection',
    'toneSelection',
    'additionalContext',
    'outlineReview',
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
      'creatingCourse',
    ].includes(stateValue);
  }
  if (typeof stateValue === 'object' && stateValue !== null) {
    return 'generatingOutline' in stateValue;
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
