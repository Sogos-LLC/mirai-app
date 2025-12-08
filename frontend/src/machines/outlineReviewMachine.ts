import { createMachine, assign, fromPromise } from 'xstate';
import type {
  GenerationJob,
  CourseOutline,
  OutlineSection,
} from '@/gen/mirai/v1/ai_generation_pb';
import { NetworkError, createAuthError, type AuthError } from './shared/types';

// ============================================================
// Types
// ============================================================

export interface OutlineReviewContext {
  courseId: string;
  outline: CourseOutline | null;
  outlineJobId: string | null;
  lessonJobId: string | null;
  totalLessons: number;
  progressPercent: number;
  progressMessage: string;
  error: AuthError | null;
}

export type OutlineReviewEvent =
  // Loading
  | { type: 'OUTLINE_READY'; outline: CourseOutline }
  | { type: 'OUTLINE_GENERATING'; jobId: string }
  // Review actions
  | { type: 'APPROVE_OUTLINE' }
  | { type: 'REGENERATE_OUTLINE' }
  | { type: 'UPDATE_SECTION_TITLE'; sectionIndex: number; title: string }
  | { type: 'UPDATE_LESSON'; sectionIndex: number; lessonIndex: number; title: string; description: string }
  // Success
  | { type: 'DISMISS_SUCCESS' }
  // Common
  | { type: 'RETRY' }
  | { type: 'DISMISS_ERROR' };

// API Response types
interface LoadOutlineResponse {
  outline: CourseOutline | null;
  job: GenerationJob | null;
}

interface GetJobResponse {
  job: GenerationJob;
}

interface GetOutlineResponse {
  outline: CourseOutline;
}

interface ApproveOutlineResponse {
  outline: CourseOutline;
}

interface GenerateLessonsResponse {
  job: GenerationJob;
}

interface RegenerateOutlineResponse {
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
// Actor Definitions
// ============================================================

/**
 * Load outline - checks if outline exists or if generation is in progress
 */
export const loadOutlineActor = fromPromise<LoadOutlineResponse, { courseId: string }>(
  async () => {
    throw new NetworkError('loadOutlineActor must be provided by the component');
  }
);

/**
 * Poll job status
 */
export const pollJobActor = fromPromise<GetJobResponse, { jobId: string }>(
  async () => {
    throw new NetworkError('pollJobActor must be provided by the component');
  }
);

/**
 * Get outline by courseId
 */
export const getOutlineActor = fromPromise<GetOutlineResponse, { courseId: string }>(
  async () => {
    throw new NetworkError('getOutlineActor must be provided by the component');
  }
);

/**
 * Approve outline
 */
export const approveOutlineActor = fromPromise<ApproveOutlineResponse, { courseId: string; outlineId: string }>(
  async () => {
    throw new NetworkError('approveOutlineActor must be provided by the component');
  }
);

/**
 * Regenerate outline
 */
export const regenerateOutlineActor = fromPromise<RegenerateOutlineResponse, { courseId: string }>(
  async () => {
    throw new NetworkError('regenerateOutlineActor must be provided by the component');
  }
);

/**
 * Generate all lessons
 */
export const generateLessonsActor = fromPromise<GenerateLessonsResponse, { courseId: string }>(
  async () => {
    throw new NetworkError('generateLessonsActor must be provided by the component');
  }
);

// ============================================================
// Input Type
// ============================================================

export interface OutlineReviewInput {
  courseId: string;
}

// ============================================================
// Machine Definition
// ============================================================

export const outlineReviewMachine = createMachine({
  id: 'outlineReview',
  initial: 'loading',
  context: ({ input }: { input: OutlineReviewInput }): OutlineReviewContext => ({
    courseId: input.courseId,
    outline: null,
    outlineJobId: null,
    lessonJobId: null,
    totalLessons: 0,
    progressPercent: 0,
    progressMessage: '',
    error: null,
  }),
  types: {} as {
    context: OutlineReviewContext;
    events: OutlineReviewEvent;
    input: OutlineReviewInput;
  },
  states: {
    // --------------------------------------------------------
    // Loading - Check if outline exists or is still generating
    // --------------------------------------------------------
    loading: {
      entry: assign({
        progressMessage: 'Loading outline...',
      }),
      invoke: {
        id: 'loadOutline',
        src: 'loadOutlineActor',
        input: ({ context }) => ({ courseId: context.courseId }),
        onDone: [
          {
            // Outline exists and is ready
            target: 'viewing',
            guard: ({ event }) => event.output.outline !== null,
            actions: assign({
              outline: ({ event }) => event.output.outline,
              totalLessons: ({ event }) =>
                event.output.outline?.sections?.reduce(
                  (acc: number, s: OutlineSection) => acc + (s.lessons?.length || 0),
                  0
                ) || 0,
              error: null,
            }),
          },
          {
            // Outline is still generating
            target: 'pollingOutline',
            guard: ({ event }) =>
              event.output.job !== null &&
              (event.output.job.status === JOB_STATUS.QUEUED ||
                event.output.job.status === JOB_STATUS.PROCESSING),
            actions: assign({
              outlineJobId: ({ event }) => event.output.job?.id || null,
              progressMessage: 'Outline is being generated...',
            }),
          },
          {
            // No outline and no job - error state
            target: 'error',
            actions: assign({
              error: () =>
                createAuthError('NOT_FOUND', 'No outline found for this course', false),
            }),
          },
        ],
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error ? event.error.message : 'Failed to load outline',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Polling Outline - Wait for outline generation to complete
    // --------------------------------------------------------
    pollingOutline: {
      initial: 'polling',
      states: {
        polling: {
          invoke: {
            id: 'pollOutlineJob',
            src: 'pollJobActor',
            input: ({ context }) => ({ jobId: context.outlineJobId! }),
            onDone: [
              {
                // Job completed - fetch outline
                target: 'fetchingOutline',
                guard: ({ event }) => event.output.job.status === JOB_STATUS.COMPLETED,
                actions: assign({
                  progressPercent: 90,
                  progressMessage: 'Outline generated, loading...',
                }),
              },
              {
                // Job failed
                target: '#outlineReview.error',
                guard: ({ event }) => event.output.job.status === JOB_STATUS.FAILED,
                actions: assign({
                  error: ({ event }) =>
                    createAuthError(
                      'GENERATION_FAILED',
                      event.output.job.errorMessage || 'Outline generation failed',
                      true
                    ),
                }),
              },
              {
                // Still processing - continue polling
                target: 'waiting',
                actions: assign({
                  progressPercent: ({ event }) =>
                    Math.min(85, 10 + (event.output.job.progressPercent || 0) * 0.75),
                  progressMessage: ({ event }) =>
                    event.output.job.progressMessage || 'Generating outline...',
                }),
              },
            ],
            onError: {
              target: '#outlineReview.error',
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
            3000: 'polling', // Poll every 3 seconds
          },
        },
        fetchingOutline: {
          invoke: {
            id: 'getOutline',
            src: 'getOutlineActor',
            input: ({ context }) => ({ courseId: context.courseId }),
            onDone: {
              target: '#outlineReview.viewing',
              actions: assign({
                outline: ({ event }) => event.output.outline,
                totalLessons: ({ event }) =>
                  event.output.outline?.sections?.reduce(
                    (acc: number, s: OutlineSection) => acc + (s.lessons?.length || 0),
                    0
                  ) || 0,
                progressPercent: 100,
                progressMessage: '',
                error: null,
              }),
            },
            onError: {
              target: '#outlineReview.error',
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
    // Viewing - User can review/edit the outline
    // --------------------------------------------------------
    viewing: {
      on: {
        APPROVE_OUTLINE: 'approving',
        REGENERATE_OUTLINE: 'regenerating',
        UPDATE_SECTION_TITLE: {
          actions: assign({
            outline: ({ context, event }) => {
              if (!context.outline?.sections) return context.outline;
              const sections = [...context.outline.sections];
              if (sections[event.sectionIndex]) {
                sections[event.sectionIndex] = {
                  ...sections[event.sectionIndex],
                  title: event.title,
                };
              }
              return { ...context.outline, sections };
            },
          }),
        },
        UPDATE_LESSON: {
          actions: assign({
            outline: ({ context, event }) => {
              if (!context.outline?.sections) return context.outline;
              const sections = [...context.outline.sections];
              const section = sections[event.sectionIndex];
              if (section?.lessons) {
                const lessons = [...section.lessons];
                if (lessons[event.lessonIndex]) {
                  lessons[event.lessonIndex] = {
                    ...lessons[event.lessonIndex],
                    title: event.title,
                    description: event.description,
                  };
                }
                sections[event.sectionIndex] = { ...section, lessons };
              }
              return { ...context.outline, sections };
            },
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Approving - Approve outline and start lesson generation
    // --------------------------------------------------------
    approving: {
      initial: 'approvingOutline',
      states: {
        approvingOutline: {
          invoke: {
            id: 'approveOutline',
            src: 'approveOutlineActor',
            input: ({ context }) => ({
              courseId: context.courseId,
              outlineId: context.outline!.id,
            }),
            onDone: {
              target: 'startingLessons',
              actions: assign({
                outline: ({ event }) => event.output.outline,
                progressMessage: 'Starting lesson generation...',
              }),
            },
            onError: {
              target: '#outlineReview.viewing',
              actions: assign({
                error: ({ event }) =>
                  createAuthError(
                    'NETWORK_ERROR',
                    event.error instanceof Error ? event.error.message : 'Failed to approve outline',
                    true
                  ),
              }),
            },
          },
        },
        startingLessons: {
          invoke: {
            id: 'generateLessons',
            src: 'generateLessonsActor',
            input: ({ context }) => ({ courseId: context.courseId }),
            onDone: {
              target: '#outlineReview.success',
              actions: assign({
                lessonJobId: ({ event }) => event.output.job.id,
                progressMessage: 'Lessons queued for generation',
              }),
            },
            onError: {
              target: '#outlineReview.viewing',
              actions: assign({
                error: ({ event }) =>
                  createAuthError(
                    'NETWORK_ERROR',
                    event.error instanceof Error
                      ? event.error.message
                      : 'Failed to start lesson generation',
                    true
                  ),
              }),
            },
          },
        },
      },
    },

    // --------------------------------------------------------
    // Success - Show celebration, user clicks OK to redirect
    // --------------------------------------------------------
    success: {
      on: {
        DISMISS_SUCCESS: 'backgroundGeneration',
      },
    },

    // --------------------------------------------------------
    // Regenerating - Generate a new outline
    // --------------------------------------------------------
    regenerating: {
      invoke: {
        id: 'regenerateOutline',
        src: 'regenerateOutlineActor',
        input: ({ context }) => ({ courseId: context.courseId }),
        onDone: {
          target: 'pollingOutline',
          actions: assign({
            outlineJobId: ({ event }) => event.output.job.id,
            outline: null,
            progressPercent: 10,
            progressMessage: 'Regenerating outline...',
          }),
        },
        onError: {
          target: 'viewing',
          actions: assign({
            error: ({ event }) =>
              createAuthError(
                'NETWORK_ERROR',
                event.error instanceof Error
                  ? event.error.message
                  : 'Failed to regenerate outline',
                true
              ),
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Background Generation - User navigated away
    // --------------------------------------------------------
    backgroundGeneration: {
      type: 'final' as const,
    },

    // --------------------------------------------------------
    // Complete - Lessons generated successfully
    // --------------------------------------------------------
    complete: {
      type: 'final' as const,
    },

    // --------------------------------------------------------
    // Error - Something went wrong
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

/**
 * Check if machine is in a generating/loading state
 */
export function isLoading(stateValue: unknown): boolean {
  if (typeof stateValue === 'string') {
    return ['loading', 'approving', 'regenerating'].includes(stateValue);
  }
  if (typeof stateValue === 'object' && stateValue !== null) {
    return (
      'pollingOutline' in stateValue ||
      'approving' in stateValue
    );
  }
  return false;
}

/**
 * Check if in success state (celebration)
 */
export function isSuccess(stateValue: unknown): boolean {
  return stateValue === 'success';
}

/**
 * Check if polling for outline
 */
export function isPollingOutline(stateValue: unknown): boolean {
  if (typeof stateValue === 'object' && stateValue !== null) {
    return 'pollingOutline' in stateValue;
  }
  return false;
}
