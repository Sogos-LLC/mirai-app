import { createMachine, assign, fromPromise } from 'xstate';
import type {
  GenerationJob,
  CoursePlan,
} from '@/gen/mirai/v1/ai_generation_types_pb';
import { NetworkError, createAuthError, type AuthError } from './shared/types';

// ============================================================
// Types
// ============================================================

export interface PlanReviewContext {
  courseId: string;
  initialJobId: string | null;
  plan: CoursePlan | null;
  outlineJobId: string | null;
  progressPercent: number;
  progressMessage: string;
  error: AuthError | null;
}

export type PlanReviewEvent =
  | { type: 'PLAN_READY'; plan: CoursePlan }
  | { type: 'PLAN_GENERATING'; jobId: string }
  | { type: 'APPROVE_PLAN' }
  | { type: 'RETRY' }
  | { type: 'DISMISS_ERROR' };

// API Response types
interface LoadPlanResponse {
  plan: CoursePlan | null;
  job: GenerationJob | null;
}

interface GetJobResponse {
  job: GenerationJob;
}

interface GetPlanResponse {
  plan: CoursePlan;
}

interface ApprovePlanResponse {
  plan: CoursePlan;
}

interface GenerateOutlineResponse {
  job: GenerationJob;
}

// Job status constants (from proto enum)
const JOB_STATUS = {
  UNSPECIFIED: 0,
  QUEUED: 1,
  PROCESSING: 2,
  COMPLETED: 3,
  FAILED: 4,
  CANCELLED: 5,
} as const;

// ============================================================
// Actor Definitions (stubs — overridden via .provide())
// ============================================================

export const loadPlanActor = fromPromise<LoadPlanResponse, { courseId: string; initialJobId?: string }>(
  async () => {
    throw new NetworkError('loadPlanActor must be provided by the component');
  }
);

export const pollJobActor = fromPromise<GetJobResponse, { jobId: string }>(
  async () => {
    throw new NetworkError('pollJobActor must be provided by the component');
  }
);

export const getPlanActor = fromPromise<GetPlanResponse, { courseId: string }>(
  async () => {
    throw new NetworkError('getPlanActor must be provided by the component');
  }
);

export const approvePlanActor = fromPromise<ApprovePlanResponse, { courseId: string }>(
  async () => {
    throw new NetworkError('approvePlanActor must be provided by the component');
  }
);

export const generateOutlineActor = fromPromise<GenerateOutlineResponse, { courseId: string }>(
  async () => {
    throw new NetworkError('generateOutlineActor must be provided by the component');
  }
);

// ============================================================
// Input Type
// ============================================================

export interface PlanReviewInput {
  courseId: string;
  initialJobId?: string;
}

// ============================================================
// Machine Definition
// ============================================================

export const planReviewMachine = createMachine({
  id: 'planReview',
  initial: 'loading',
  context: ({ input }: { input: PlanReviewInput }): PlanReviewContext => ({
    courseId: input.courseId,
    initialJobId: input.initialJobId ?? null,
    plan: null,
    outlineJobId: null,
    progressPercent: 0,
    progressMessage: '',
    error: null,
  }),
  types: {} as {
    context: PlanReviewContext;
    events: PlanReviewEvent;
    input: PlanReviewInput;
  },
  states: {
    // --------------------------------------------------------
    // Loading - Check if plan exists or is still generating
    // --------------------------------------------------------
    loading: {
      entry: assign({
        progressMessage: 'Loading course plan...',
      }),
      invoke: {
        id: 'loadPlan',
        src: 'loadPlanActor',
        input: ({ context }) => ({ courseId: context.courseId, initialJobId: context.initialJobId ?? undefined }),
        onDone: [
          {
            target: 'viewing',
            guard: ({ event }) => event.output.plan !== null,
            actions: assign({
              plan: ({ event }) => event.output.plan,
              error: null,
            }),
          },
          {
            target: 'pollingPlan',
            guard: ({ event }) =>
              event.output.job !== null &&
              (event.output.job.status === JOB_STATUS.QUEUED ||
                event.output.job.status === JOB_STATUS.PROCESSING),
            actions: assign({
              progressPercent: 10,
              progressMessage: 'Analyzing documents and generating course plan...',
            }),
          },
          {
            target: 'error',
            actions: assign({
              error: () =>
                createAuthError('NOT_FOUND', 'No course plan found. Please start course generation from the wizard.', false),
            }),
          },
        ],
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error ? event.error.message : 'Failed to load course plan',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Polling Plan - Wait for plan generation to complete
    // --------------------------------------------------------
    pollingPlan: {
      initial: 'polling',
      states: {
        polling: {
          invoke: {
            id: 'pollPlanJob',
            src: 'pollJobActor',
            input: ({ context }) => ({ jobId: context.initialJobId! }),
            onDone: [
              {
                target: '#planReview.error',
                guard: ({ event }) => !event.output.job,
                actions: assign({
                  error: () =>
                    createAuthError('NOT_FOUND', 'Job not found. It may have been deleted.', true),
                }),
              },
              {
                target: 'fetchingPlan',
                guard: ({ event }) => event.output.job?.status === JOB_STATUS.COMPLETED,
                actions: assign({
                  progressPercent: 90,
                  progressMessage: 'Course plan generated, loading...',
                }),
              },
              {
                target: '#planReview.error',
                guard: ({ event }) => event.output.job?.status === JOB_STATUS.FAILED,
                actions: assign({
                  error: ({ event }) =>
                    createAuthError(
                      'GENERATION_FAILED',
                      event.output.job?.errorMessage || 'Course plan generation failed',
                      true
                    ),
                }),
              },
              {
                target: '#planReview.error',
                guard: ({ event }) => event.output.job?.status === JOB_STATUS.CANCELLED,
                actions: assign({
                  error: () =>
                    createAuthError('GENERATION_FAILED', 'Course plan generation was cancelled', true),
                }),
              },
              {
                target: 'waiting',
                actions: assign({
                  progressPercent: ({ event }) =>
                    Math.min(85, 10 + (event.output.job?.progressPercent || 0) * 0.75),
                  progressMessage: ({ event }) =>
                    event.output.job?.progressMessage || 'Analyzing documents...',
                }),
              },
            ],
            onError: {
              target: '#planReview.error',
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
        },
        fetchingPlan: {
          invoke: {
            id: 'getPlan',
            src: 'getPlanActor',
            input: ({ context }) => ({ courseId: context.courseId }),
            onDone: {
              target: '#planReview.viewing',
              actions: assign({
                plan: ({ event }) => event.output.plan,
                progressPercent: 100,
                progressMessage: '',
                error: null,
              }),
            },
            onError: {
              target: '#planReview.error',
              actions: assign({
                error: ({ event }) =>
                  createAuthError(
                    'NETWORK_ERROR',
                    event.error instanceof Error ? event.error.message : 'Failed to fetch course plan',
                    true
                  ),
              }),
            },
          },
        },
      },
    },

    // --------------------------------------------------------
    // Viewing - User reviews the plan
    // --------------------------------------------------------
    viewing: {
      on: {
        APPROVE_PLAN: 'approving',
      },
    },

    // --------------------------------------------------------
    // Approving - Mark plan as approved, then trigger outline generation
    // --------------------------------------------------------
    approving: {
      invoke: {
        id: 'approvePlan',
        src: 'approvePlanActor',
        input: ({ context }) => ({ courseId: context.courseId }),
        onDone: {
          target: 'generatingOutline',
          actions: assign({
            plan: ({ event }) => event.output.plan,
          }),
        },
        onError: {
          target: 'viewing',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error ? event.error.message : 'Failed to approve course plan',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Generating Outline - Trigger outline generation after plan approval
    // --------------------------------------------------------
    generatingOutline: {
      invoke: {
        id: 'generateOutline',
        src: 'generateOutlineActor',
        input: ({ context }) => ({ courseId: context.courseId }),
        onDone: {
          target: 'approved',
          actions: assign({
            outlineJobId: ({ event }) => event.output.job.id,
          }),
        },
        onError: {
          target: 'approved',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error ? event.error.message : 'Failed to start outline generation',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Approved - Plan approved, redirect to outline page
    // --------------------------------------------------------
    approved: {
      type: 'final' as const,
    },

    // --------------------------------------------------------
    // Error
    // --------------------------------------------------------
    error: {
      on: {
        RETRY: 'loading',
        DISMISS_ERROR: {
          actions: assign({ error: null }),
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

export function isPlanLoading(stateValue: unknown): boolean {
  if (typeof stateValue === 'string') {
    return ['loading', 'approving', 'generatingOutline'].includes(stateValue);
  }
  if (typeof stateValue === 'object' && stateValue !== null) {
    return 'pollingPlan' in stateValue;
  }
  return false;
}

export function isPollingPlan(stateValue: unknown): boolean {
  if (typeof stateValue === 'object' && stateValue !== null) {
    return 'pollingPlan' in stateValue;
  }
  return false;
}
