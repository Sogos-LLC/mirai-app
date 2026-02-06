import { createMachine, assign, fromPromise } from 'xstate';
import {
  WorkflowStepType,
  GenerationJobStatus,
} from '@/gen/mirai/v1/ai_generation_types_pb';

// ============================================================
// Types
// ============================================================

/**
 * Parsed step data from the workflow's step_data_json.
 * The shape varies per step type.
 */
export interface StepData {
  [key: string]: unknown;
}

/**
 * Workflow state returned by the GetWorkflowState RPC (Temporal query).
 */
export interface WorkflowStateData {
  status: string;
  currentStep: string;
  stepDataJson: string;
  progressPercent: number;
  progressMessage: string;
}

/**
 * Context for the course creation workflow machine.
 * Tracks the active workflow job and the current approval step.
 */
export interface CourseCreationContext {
  // Job tracking
  jobId: string | null;
  courseId: string | null;

  // Current workflow state
  pendingStep: WorkflowStepType | null;
  stepData: StepData | null;
  progressPercent: number;
  progressMessage: string;

  // Error
  error: string | null;
}

export type CourseCreationEvent =
  // Workflow started successfully
  | { type: 'WORKFLOW_STARTED'; jobId: string; courseId: string }
  // Resume an active workflow (from dashboard or page remount)
  | { type: 'RESUME'; jobId: string; courseId: string; status: GenerationJobStatus }
  // Temporal query state update (replaces SSE events)
  | { type: 'STATE_UPDATE'; state: WorkflowStateData }
  // User approves the current step
  | { type: 'APPROVE'; selectedIds?: string[]; modifications?: Record<string, string> }
  // User rejects the current step with feedback
  | { type: 'REJECT'; feedback: string }
  // Dismiss error
  | { type: 'DISMISS_ERROR' }
  // Reset to idle (retry after failure)
  | { type: 'RESET' };

// ============================================================
// Initial Context
// ============================================================

export const initialContext: CourseCreationContext = {
  jobId: null,
  courseId: null,
  pendingStep: null,
  stepData: null,
  progressPercent: 0,
  progressMessage: '',
  error: null,
};

// ============================================================
// Actor Definitions (stubs - provided by component)
// ============================================================

export const approveStepActor = fromPromise<
  void,
  { jobId: string; step: WorkflowStepType; selectedIds?: string[]; modifications?: Record<string, string> }
>(async () => {
  throw new Error('approveStepActor must be provided by the component');
});

export const rejectStepActor = fromPromise<
  void,
  { jobId: string; step: WorkflowStepType; feedback: string }
>(async () => {
  throw new Error('rejectStepActor must be provided by the component');
});

// ============================================================
// Machine Definition
// ============================================================

export const courseCreationMachine = createMachine({
  id: 'courseCreation',
  initial: 'idle',
  context: initialContext,
  types: {} as {
    context: CourseCreationContext;
    events: CourseCreationEvent;
  },
  states: {
    // --------------------------------------------------------
    // Idle: waiting for workflow to start
    // --------------------------------------------------------
    idle: {
      on: {
        WORKFLOW_STARTED: {
          target: 'processing',
          actions: assign({
            jobId: ({ event }) => event.jobId,
            courseId: ({ event }) => event.courseId,
            progressPercent: 0,
            progressMessage: 'Starting course creation...',
            error: null,
          }),
        },
        RESUME: {
          target: 'processing',
          actions: assign({
            jobId: ({ event }) => event.jobId,
            courseId: ({ event }) => event.courseId,
            progressPercent: 0,
            progressMessage: 'Reconnecting to workflow...',
            error: null,
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Processing: workflow is running, AI is generating content
    // --------------------------------------------------------
    processing: {
      on: {
        STATE_UPDATE: [
          {
            guard: ({ event }) => event.state.status === 'awaiting_approval',
            target: 'awaitingApproval',
            actions: assign({
              pendingStep: ({ event }) => stepStringToEnum(event.state.currentStep),
              stepData: ({ event }) => parseStepData(event.state.stepDataJson),
              progressPercent: ({ event }) => event.state.progressPercent,
              progressMessage: ({ event }) => event.state.progressMessage,
            }),
          },
          {
            guard: ({ event }) => event.state.status === 'completed',
            target: 'completed',
            actions: assign({
              progressPercent: 100,
              progressMessage: 'Course creation complete!',
            }),
          },
          {
            guard: ({ event }) => event.state.status === 'failed',
            target: 'failed',
            actions: assign({
              error: ({ event }) => event.state.progressMessage || 'Workflow failed',
            }),
          },
          {
            actions: assign({
              progressPercent: ({ event }) => event.state.progressPercent,
              progressMessage: ({ event }) => event.state.progressMessage,
            }),
          },
        ],
      },
    },

    // --------------------------------------------------------
    // Awaiting Approval: workflow is paused, showing step data
    // --------------------------------------------------------
    awaitingApproval: {
      on: {
        APPROVE: {
          target: 'sendingApproval',
        },
        REJECT: {
          target: 'sendingRejection',
        },
        STATE_UPDATE: [
          {
            guard: ({ event }) => event.state.status === 'completed',
            target: 'completed',
            actions: assign({
              progressPercent: 100,
              progressMessage: 'Course creation complete!',
            }),
          },
          {
            guard: ({ event }) => event.state.status === 'failed',
            target: 'failed',
            actions: assign({
              error: ({ event }) => event.state.progressMessage || 'Workflow failed',
            }),
          },
        ],
      },
    },

    // --------------------------------------------------------
    // Sending Approval: calling the approve RPC
    // --------------------------------------------------------
    sendingApproval: {
      invoke: {
        id: 'approveStep',
        src: 'approveStepActor',
        input: ({ context, event }) => {
          const approveEvent = event as Extract<CourseCreationEvent, { type: 'APPROVE' }>;
          return {
            jobId: context.jobId!,
            step: context.pendingStep!,
            selectedIds: approveEvent.selectedIds,
            modifications: approveEvent.modifications,
          };
        },
        onDone: {
          target: 'processing',
          actions: assign({
            pendingStep: null,
            stepData: null,
          }),
        },
        onError: {
          target: 'awaitingApproval',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : 'Failed to send approval',
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Sending Rejection: calling the reject RPC
    // --------------------------------------------------------
    sendingRejection: {
      invoke: {
        id: 'rejectStep',
        src: 'rejectStepActor',
        input: ({ context, event }) => {
          const rejectEvent = event as Extract<CourseCreationEvent, { type: 'REJECT' }>;
          return {
            jobId: context.jobId!,
            step: context.pendingStep!,
            feedback: rejectEvent.feedback,
          };
        },
        onDone: {
          target: 'processing',
          actions: assign({
            pendingStep: null,
            stepData: null,
            progressMessage: 'Regenerating...',
          }),
        },
        onError: {
          target: 'awaitingApproval',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : 'Failed to send rejection',
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Completed: workflow finished successfully
    // --------------------------------------------------------
    completed: {
      type: 'final' as const,
    },

    // --------------------------------------------------------
    // Failed: workflow errored out — can retry
    // --------------------------------------------------------
    failed: {
      on: {
        RESET: {
          target: 'idle',
          actions: assign(initialContext),
        },
      },
    },
  },
  on: {
    DISMISS_ERROR: {
      actions: assign({ error: null }),
    },
  },
});

// ============================================================
// Helper functions
// ============================================================

/**
 * Convert a step string from Temporal query to WorkflowStepType enum.
 */
function stepStringToEnum(step: string): WorkflowStepType {
  switch (step) {
    case 'title':
      return WorkflowStepType.TITLE;
    case 'outcomes':
      return WorkflowStepType.OUTCOMES;
    case 'sme_personas':
      return WorkflowStepType.SME_PERSONAS;
    case 'audience_personas':
      return WorkflowStepType.AUDIENCE_PERSONAS;
    case 'tone_options':
      return WorkflowStepType.TONE_OPTIONS;
    case 'course_plan':
      return WorkflowStepType.COURSE_PLAN;
    case 'outline':
      return WorkflowStepType.OUTLINE;
    case 'lessons':
      return WorkflowStepType.LESSONS;
    default:
      return WorkflowStepType.UNSPECIFIED;
  }
}

/**
 * Get a human-readable label for a workflow step.
 */
export function getWorkflowStepLabel(step: WorkflowStepType): string {
  switch (step) {
    case WorkflowStepType.TITLE:
      return 'Title & Description';
    case WorkflowStepType.OUTCOMES:
      return 'Learning Outcomes';
    case WorkflowStepType.SME_PERSONAS:
      return 'SME Personas';
    case WorkflowStepType.AUDIENCE_PERSONAS:
      return 'Target Audience';
    case WorkflowStepType.TONE_OPTIONS:
      return 'Tone & Style';
    case WorkflowStepType.COURSE_PLAN:
      return 'Course Plan';
    case WorkflowStepType.OUTLINE:
      return 'Course Outline';
    case WorkflowStepType.LESSONS:
      return 'Lesson Content';
    default:
      return 'Unknown Step';
  }
}

/**
 * Get the step number (1-based) for progress display.
 */
export function getWorkflowStepNumber(step: WorkflowStepType): number {
  switch (step) {
    case WorkflowStepType.TITLE:
      return 1;
    case WorkflowStepType.OUTCOMES:
      return 2;
    case WorkflowStepType.SME_PERSONAS:
      return 3;
    case WorkflowStepType.AUDIENCE_PERSONAS:
      return 4;
    case WorkflowStepType.TONE_OPTIONS:
      return 5;
    case WorkflowStepType.COURSE_PLAN:
      return 6;
    case WorkflowStepType.OUTLINE:
      return 7;
    case WorkflowStepType.LESSONS:
      return 8;
    default:
      return 0;
  }
}

/**
 * Total number of possible workflow steps.
 */
export const TOTAL_WORKFLOW_STEPS = 8;

/**
 * Number of user-facing wizard phases (collapsed from 8 backend steps).
 */
export const TOTAL_WIZARD_PHASES = 5;

/**
 * Map a backend WorkflowStepType (or null/idle) to a user-facing phase (1-5).
 *
 * Phase mapping:
 *   1 – Course Setup     (idle → TITLE)
 *   2 – Learning Outcomes (OUTCOMES)
 *   3 – Expert Personas   (SME_PERSONAS, AUDIENCE_PERSONAS)
 *   4 – Tone & Style      (TONE_OPTIONS)
 *   5 – Course Content    (COURSE_PLAN, OUTLINE, LESSONS)
 */
export function getWizardPhase(step: WorkflowStepType | null, isIdle: boolean): number {
  if (isIdle || !step) return 1;
  switch (step) {
    case WorkflowStepType.TITLE:
      return 1;
    case WorkflowStepType.OUTCOMES:
      return 2;
    case WorkflowStepType.SME_PERSONAS:
    case WorkflowStepType.AUDIENCE_PERSONAS:
      return 3;
    case WorkflowStepType.TONE_OPTIONS:
      return 4;
    case WorkflowStepType.COURSE_PLAN:
    case WorkflowStepType.OUTLINE:
    case WorkflowStepType.LESSONS:
      return 5;
    default:
      return 1;
  }
}

/**
 * Parse the step_data_json from a Temporal query into a typed StepData object.
 */
export function parseStepData(stepDataJson: string | undefined): StepData | null {
  if (!stepDataJson) return null;
  try {
    return JSON.parse(stepDataJson) as StepData;
  } catch {
    return null;
  }
}
