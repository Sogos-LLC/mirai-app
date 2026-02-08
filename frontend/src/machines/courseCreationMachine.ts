import { createMachine, assign, fromPromise } from 'xstate';
import {
  WorkflowStepType,
  GenerationJobStatus,
} from '@/gen/mirai/v1/ai_generation_types_pb';

// ============================================================
// Types
// ============================================================

export interface StepData {
  [key: string]: unknown;
}

export interface WorkflowStateData {
  status: string;
  currentStep: string;
  stepDataJson: string;
  progressPercent: number;
  progressMessage: string;
}

export interface CourseCreationContext {
  jobId: string | null;
  courseId: string | null;
  pendingStep: WorkflowStepType | null;
  stepData: StepData | null;
  progressPercent: number;
  progressMessage: string;
  error: string | null;
}

export type CourseCreationEvent =
  | { type: 'WORKFLOW_STARTED'; jobId: string; courseId: string }
  | { type: 'RESUME'; jobId: string; courseId: string; status: GenerationJobStatus }
  | { type: 'STATE_UPDATE'; state: WorkflowStateData }
  | { type: 'APPROVE'; selectedIds?: string[]; modifications?: Record<string, string> }
  | { type: 'REJECT'; feedback: string }
  | { type: 'DISMISS_ERROR' }
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

    completed: {
      type: 'final' as const,
    },

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

function stepStringToEnum(step: string): WorkflowStepType {
  switch (step) {
    case 'intent_analysis':
      return WorkflowStepType.INTENT_ANALYSIS;
    case 'define_success':
      return WorkflowStepType.DEFINE_SUCCESS;
    case 'approve_structure':
      return WorkflowStepType.APPROVE_STRUCTURE;
    case 'sample_lesson':
      return WorkflowStepType.SAMPLE_LESSON;
    case 'final_review':
      return WorkflowStepType.FINAL_REVIEW;
    case 'combined_review':
      return WorkflowStepType.COMBINED_REVIEW;
    default:
      return WorkflowStepType.UNSPECIFIED;
  }
}

export function getWorkflowStepLabel(step: WorkflowStepType): string {
  switch (step) {
    case WorkflowStepType.COMBINED_REVIEW:
      return 'Review Course Plan';
    default:
      return 'Unknown Step';
  }
}

export function getWorkflowStepNumber(step: WorkflowStepType): number {
  switch (step) {
    case WorkflowStepType.COMBINED_REVIEW:
      return 1;
    default:
      return 0;
  }
}

export const TOTAL_WORKFLOW_STEPS = 1;

export function parseStepData(stepDataJson: string | undefined): StepData | null {
  if (!stepDataJson) return null;
  try {
    return JSON.parse(stepDataJson) as StepData;
  } catch {
    return null;
  }
}
