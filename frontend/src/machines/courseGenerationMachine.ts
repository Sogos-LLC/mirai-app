import { createMachine, assign, fromPromise } from 'xstate';
import type {
  GenerationJob,
  CourseOutline,
  OutlineSection,
  GeneratedLesson,
  GenerationJobStatus,
} from '@/gen/mirai/v1/ai_generation_pb';
import { courseGenerationTelemetry, emitTelemetry, LMS_TELEMETRY } from './shared/telemetry';
import { NetworkError, createAuthError, type AuthError } from './shared/types';

// ============================================================
// Types
// ============================================================

export interface CourseGenerationInput {
  courseId: string;
  smeIds: string[];
  targetAudienceIds: string[];
  desiredOutcome: string;
  additionalContext?: string;
}

export interface CourseGenerationContext {
  // Input configuration
  input: CourseGenerationInput | null;

  // Generation state
  outlineJob: GenerationJob | null;
  outline: CourseOutline | null;
  lessonJob: GenerationJob | null;
  generatedLessons: GeneratedLesson[];

  // Progress tracking
  currentStep: 'configure' | 'generating-outline' | 'review-outline' | 'job-queued' | 'generating-lessons' | 'complete';
  progressPercent: number;
  progressMessage: string;
  totalLessons: number;
  completedLessons: number;

  // Error handling
  error: AuthError | null;
  flowStartedAt: number | null;
}

export type CourseGenerationEvent =
  // Configuration
  | { type: 'SET_INPUT'; input: CourseGenerationInput }
  | { type: 'START_GENERATION' }
  // Outline flow
  | { type: 'POLL_OUTLINE' }
  | { type: 'OUTLINE_GENERATED'; outline: CourseOutline }
  | { type: 'APPROVE_OUTLINE' }
  | { type: 'REJECT_OUTLINE'; reason: string }
  | { type: 'UPDATE_OUTLINE'; sections: OutlineSection[] }
  | { type: 'REGENERATE_OUTLINE' }
  // Job queued - user choice after outline approval
  | { type: 'WAIT_FOR_COMPLETION' }  // User wants to watch progress
  | { type: 'NAVIGATE_AWAY' }        // User will be notified when done
  // Lesson generation
  | { type: 'START_LESSON_GENERATION' }
  | { type: 'POLL_LESSONS' }
  | { type: 'LESSONS_GENERATED'; lessons: GeneratedLesson[] }
  // Common
  | { type: 'CANCEL' }
  | { type: 'RETRY' }
  | { type: 'RESET' }
  | { type: 'DISMISS_ERROR' };

// API Response types
interface GenerateOutlineResponse {
  job: GenerationJob;
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

interface RejectOutlineResponse {
  outline: CourseOutline;
}

interface UpdateOutlineResponse {
  outline: CourseOutline;
}

interface GenerateLessonsResponse {
  job: GenerationJob;
}

interface ListLessonsResponse {
  lessons: GeneratedLesson[];
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
// Initial Context
// ============================================================

const initialContext: CourseGenerationContext = {
  input: null,
  outlineJob: null,
  outline: null,
  lessonJob: null,
  generatedLessons: [],
  currentStep: 'configure',
  progressPercent: 0,
  progressMessage: '',
  totalLessons: 0,
  completedLessons: 0,
  error: null,
  flowStartedAt: null,
};

// ============================================================
// Actor Definitions
// ============================================================

/**
 * Generate course outline actor
 */
export const generateOutlineActor = fromPromise<GenerateOutlineResponse, CourseGenerationInput>(
  async ({ input }) => {
    throw new NetworkError('generateOutlineActor must be provided by the component');
  }
);

/**
 * Poll job status actor
 */
export const pollJobActor = fromPromise<GetJobResponse, { jobId: string }>(
  async ({ input }) => {
    throw new NetworkError('pollJobActor must be provided by the component');
  }
);

/**
 * Get outline actor
 */
export const getOutlineActor = fromPromise<GetOutlineResponse, { courseId: string }>(
  async ({ input }) => {
    throw new NetworkError('getOutlineActor must be provided by the component');
  }
);

/**
 * Approve outline actor
 */
export const approveOutlineActor = fromPromise<ApproveOutlineResponse, { courseId: string; outlineId: string }>(
  async ({ input }) => {
    throw new NetworkError('approveOutlineActor must be provided by the component');
  }
);

/**
 * Reject outline actor
 */
export const rejectOutlineActor = fromPromise<RejectOutlineResponse, { courseId: string; outlineId: string; reason: string }>(
  async ({ input }) => {
    throw new NetworkError('rejectOutlineActor must be provided by the component');
  }
);

/**
 * Update outline actor
 */
export const updateOutlineActor = fromPromise<UpdateOutlineResponse, { courseId: string; outlineId: string; sections: OutlineSection[] }>(
  async ({ input }) => {
    throw new NetworkError('updateOutlineActor must be provided by the component');
  }
);

/**
 * Generate all lessons actor
 */
export const generateLessonsActor = fromPromise<GenerateLessonsResponse, { courseId: string }>(
  async ({ input }) => {
    throw new NetworkError('generateLessonsActor must be provided by the component');
  }
);

/**
 * List generated lessons actor
 */
export const listLessonsActor = fromPromise<ListLessonsResponse, { courseId: string }>(
  async ({ input }) => {
    throw new NetworkError('listLessonsActor must be provided by the component');
  }
);

// ============================================================
// Machine Definition
// ============================================================

export const courseGenerationMachine = createMachine({
  id: 'courseGeneration',
  initial: 'configure',
  context: initialContext,
  types: {} as {
    context: CourseGenerationContext;
    events: CourseGenerationEvent;
  },
  states: {
    // --------------------------------------------------------
    // Configure - setting up generation parameters
    // --------------------------------------------------------
    configure: {
      entry: assign({
        currentStep: 'configure' as const,
        progressPercent: 0,
        progressMessage: '',
      }),
      on: {
        SET_INPUT: {
          actions: assign({
            input: ({ event }) => event.input,
            error: null,
          }),
        },
        START_GENERATION: {
          target: 'generatingOutline',
          guard: ({ context }) =>
            context.input !== null &&
            context.input.courseId.length > 0 &&
            context.input.smeIds.length > 0 &&
            context.input.desiredOutcome.length > 0,
          actions: assign({
            flowStartedAt: () => Date.now(),
          }),
        },
        // Allow jumping directly to outline review when editing an existing course
        OUTLINE_GENERATED: {
          target: 'reviewOutline',
          actions: assign({
            outline: ({ event }) => event.outline,
            progressPercent: 100,
            progressMessage: 'Outline ready for review',
          }),
        },
      },
    },

    // --------------------------------------------------------
    // Generating Outline - waiting for AI to generate course structure
    // --------------------------------------------------------
    generatingOutline: {
      initial: 'submitting',
      entry: [
        assign({
          currentStep: 'generating-outline' as const,
          progressPercent: 10,
          progressMessage: 'Starting outline generation...',
        }),
        courseGenerationTelemetry.started,
      ],
      states: {
        submitting: {
          invoke: {
            id: 'generateOutline',
            src: 'generateOutlineActor',
            input: ({ context }) => context.input!,
            onDone: {
              target: 'polling',
              actions: assign({
                outlineJob: ({ event }) => event.output.job,
                progressPercent: 20,
                progressMessage: 'Outline generation in progress...',
              }),
            },
            onError: {
              target: '#courseGeneration.configure',
              actions: [
                assign({
                  error: ({ event }) =>
                    createAuthError(
                      'NETWORK_ERROR',
                      event.error instanceof Error ? event.error.message : 'Failed to start generation',
                      true
                    ),
                }),
                courseGenerationTelemetry.failed,
              ],
            },
          },
        },
        polling: {
          invoke: {
            id: 'pollOutlineJob',
            src: 'pollJobActor',
            input: ({ context }) => ({ jobId: context.outlineJob!.id }),
            onDone: [
              {
                // Job completed - fetch the outline
                target: 'fetchingOutline',
                guard: ({ event }) => event.output.job.status === JOB_STATUS.COMPLETED,
                actions: assign({
                  outlineJob: ({ event }) => event.output.job,
                  progressPercent: 80,
                  progressMessage: 'Outline generated, loading...',
                }),
              },
              {
                // Job failed
                target: '#courseGeneration.configure',
                guard: ({ event }) => event.output.job.status === JOB_STATUS.FAILED,
                actions: [
                  assign({
                    outlineJob: ({ event }) => event.output.job,
                    error: ({ event }) =>
                      createAuthError(
                        'NETWORK_ERROR',
                        event.output.job.errorMessage || 'Outline generation failed',
                        true
                      ),
                  }),
                  courseGenerationTelemetry.failed,
                ],
              },
              {
                // Still processing - update progress and continue
                target: 'waiting',
                actions: assign({
                  outlineJob: ({ event }) => event.output.job,
                  progressPercent: ({ event }) => Math.min(75, 20 + event.output.job.progressPercent * 0.55),
                  progressMessage: ({ event }) => event.output.job.progressMessage || 'Generating outline...',
                }),
              },
            ],
            onError: {
              target: '#courseGeneration.configure',
              actions: [
                assign({
                  error: ({ event }) =>
                    createAuthError(
                      'NETWORK_ERROR',
                      event.error instanceof Error ? event.error.message : 'Failed to poll job status',
                      true
                    ),
                }),
                courseGenerationTelemetry.failed,
              ],
            },
          },
        },
        waiting: {
          after: {
            3000: 'polling', // Poll every 3 seconds
          },
          on: {
            CANCEL: '#courseGeneration.configure',
          },
        },
        fetchingOutline: {
          invoke: {
            id: 'getOutline',
            src: 'getOutlineActor',
            input: ({ context }) => ({ courseId: context.input!.courseId }),
            onDone: {
              target: '#courseGeneration.reviewOutline',
              actions: [
                assign({
                  outline: ({ event }) => event.output.outline,
                  progressPercent: 100,
                  progressMessage: 'Outline ready for review',
                  error: null,
                }),
                courseGenerationTelemetry.outlineGenerated,
              ],
            },
            onError: {
              target: '#courseGeneration.configure',
              actions: [
                assign({
                  error: ({ event }) =>
                    createAuthError(
                      'NETWORK_ERROR',
                      event.error instanceof Error ? event.error.message : 'Failed to fetch outline',
                      true
                    ),
                }),
                courseGenerationTelemetry.failed,
              ],
            },
          },
        },
      },
    },

    // --------------------------------------------------------
    // Review Outline - user reviews and approves/rejects the outline
    // --------------------------------------------------------
    reviewOutline: {
      initial: 'viewing',
      entry: assign({
        currentStep: 'review-outline' as const,
        progressPercent: 0,
        progressMessage: '',
      }),
      states: {
        viewing: {
          on: {
            APPROVE_OUTLINE: 'approving',
            REJECT_OUTLINE: {
              target: 'rejecting',
            },
            UPDATE_OUTLINE: 'updating',
            REGENERATE_OUTLINE: '#courseGeneration.generatingOutline',
          },
        },
        approving: {
          invoke: {
            id: 'approveOutline',
            src: 'approveOutlineActor',
            input: ({ context }) => ({
              courseId: context.input!.courseId,
              outlineId: context.outline!.id,
            }),
            onDone: {
              target: '#courseGeneration.jobQueued',
              actions: [
                assign({
                  outline: ({ event }) => event.output.outline,
                  error: null,
                }),
                courseGenerationTelemetry.outlineApproved,
              ],
            },
            onError: {
              target: 'viewing',
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
        rejecting: {
          invoke: {
            id: 'rejectOutline',
            src: 'rejectOutlineActor',
            input: ({ context, event }) => ({
              courseId: context.input!.courseId,
              outlineId: context.outline!.id,
              reason: (event as { type: 'REJECT_OUTLINE'; reason: string }).reason,
            }),
            onDone: {
              target: '#courseGeneration.generatingOutline',
              actions: [
                assign({
                  outline: null,
                  error: null,
                }),
                courseGenerationTelemetry.outlineRejected,
              ],
            },
            onError: {
              target: 'viewing',
              actions: assign({
                error: ({ event }) =>
                  createAuthError(
                    'NETWORK_ERROR',
                    event.error instanceof Error ? event.error.message : 'Failed to reject outline',
                    true
                  ),
              }),
            },
          },
        },
        updating: {
          invoke: {
            id: 'updateOutline',
            src: 'updateOutlineActor',
            input: ({ context, event }) => ({
              courseId: context.input!.courseId,
              outlineId: context.outline!.id,
              sections: (event as { type: 'UPDATE_OUTLINE'; sections: OutlineSection[] }).sections,
            }),
            onDone: {
              target: 'viewing',
              actions: assign({
                outline: ({ event }) => event.output.outline,
                error: null,
              }),
            },
            onError: {
              target: 'viewing',
              actions: assign({
                error: ({ event }) =>
                  createAuthError(
                    'NETWORK_ERROR',
                    event.error instanceof Error ? event.error.message : 'Failed to update outline',
                    true
                  ),
              }),
            },
          },
        },
      },
    },

    // --------------------------------------------------------
    // Job Queued - confirmation after outline approval
    // User can choose to wait for completion or navigate away
    // --------------------------------------------------------
    jobQueued: {
      initial: 'submitting',
      entry: assign({
        currentStep: 'job-queued' as const,
        progressPercent: 0,
        progressMessage: 'Starting lesson generation...',
      }),
      states: {
        submitting: {
          invoke: {
            id: 'generateLessonsForQueue',
            src: 'generateLessonsActor',
            input: ({ context }) => ({ courseId: context.input!.courseId }),
            onDone: {
              target: 'confirmation',
              actions: assign({
                lessonJob: ({ event }) => event.output.job,
                progressPercent: 5,
                progressMessage: ({ context }) => {
                  // Count lessons in outline
                  const totalLessons = context.outline?.sections?.reduce(
                    (acc, section) => acc + (section.lessons?.length || 0),
                    0
                  ) || 0;
                  return `${totalLessons} lessons queued for generation`;
                },
                totalLessons: ({ context }) =>
                  context.outline?.sections?.reduce(
                    (acc, section) => acc + (section.lessons?.length || 0),
                    0
                  ) || 0,
              }),
            },
            onError: {
              target: '#courseGeneration.reviewOutline',
              actions: [
                assign({
                  error: ({ event }) =>
                    createAuthError(
                      'NETWORK_ERROR',
                      event.error instanceof Error ? event.error.message : 'Failed to start lesson generation',
                      true
                    ),
                }),
                courseGenerationTelemetry.failed,
              ],
            },
          },
        },
        confirmation: {
          // User sees confirmation modal with job ID and can choose to wait or navigate away
          on: {
            WAIT_FOR_COMPLETION: '#courseGeneration.generatingLessons',
            NAVIGATE_AWAY: '#courseGeneration.backgroundGeneration',
          },
        },
      },
    },

    // --------------------------------------------------------
    // Background Generation - user navigated away, job runs in background
    // --------------------------------------------------------
    backgroundGeneration: {
      type: 'final' as const,
      entry: [
        assign({
          currentStep: 'generating-lessons' as const,
          progressMessage: 'Generation continues in background. You will be notified when complete.',
        }),
        // Emit telemetry for background generation
        ({ context }) => {
          emitTelemetry(LMS_TELEMETRY.GENERATION_BACKGROUNDED, {
            machineId: 'courseGeneration',
            metadata: {
              courseId: context.input?.courseId,
              jobId: context.lessonJob?.id,
              totalLessons: context.totalLessons,
            },
          });
        },
      ],
    },

    // --------------------------------------------------------
    // Generating Lessons - AI generates content for all lessons
    // User is actively waiting and watching progress
    // --------------------------------------------------------
    generatingLessons: {
      initial: 'polling',
      entry: [
        assign({
          currentStep: 'generating-lessons' as const,
          progressPercent: 10,
          progressMessage: 'Generating lesson content...',
        }),
        courseGenerationTelemetry.lessonsGenerating,
      ],
      states: {
        polling: {
          invoke: {
            id: 'pollLessonJob',
            src: 'pollJobActor',
            input: ({ context }) => ({ jobId: context.lessonJob!.id }),
            onDone: [
              {
                // Job completed - fetch lessons
                target: 'fetchingLessons',
                guard: ({ event }) => event.output.job.status === JOB_STATUS.COMPLETED,
                actions: assign({
                  lessonJob: ({ event }) => event.output.job,
                  progressPercent: 90,
                  progressMessage: 'Lessons generated, loading...',
                }),
              },
              {
                // Job failed
                target: '#courseGeneration.reviewOutline',
                guard: ({ event }) => event.output.job.status === JOB_STATUS.FAILED,
                actions: [
                  assign({
                    lessonJob: ({ event }) => event.output.job,
                    error: ({ event }) =>
                      createAuthError(
                        'NETWORK_ERROR',
                        event.output.job.errorMessage || 'Lesson generation failed',
                        true
                      ),
                  }),
                  courseGenerationTelemetry.failed,
                ],
              },
              {
                // Still processing - update progress and continue
                target: 'waiting',
                actions: assign({
                  lessonJob: ({ event }) => event.output.job,
                  progressPercent: ({ event }) => Math.min(85, 10 + event.output.job.progressPercent * 0.75),
                  progressMessage: ({ event }) => event.output.job.progressMessage || 'Generating lessons...',
                }),
              },
            ],
            onError: {
              target: '#courseGeneration.reviewOutline',
              actions: [
                assign({
                  error: ({ event }) =>
                    createAuthError(
                      'NETWORK_ERROR',
                      event.error instanceof Error ? event.error.message : 'Failed to poll job status',
                      true
                    ),
                }),
                courseGenerationTelemetry.failed,
              ],
            },
          },
        },
        waiting: {
          after: {
            7000: 'polling', // Poll every 7 seconds (per user preference)
          },
          on: {
            CANCEL: '#courseGeneration.reviewOutline',
            NAVIGATE_AWAY: '#courseGeneration.backgroundGeneration',
          },
        },
        fetchingLessons: {
          invoke: {
            id: 'listLessons',
            src: 'listLessonsActor',
            input: ({ context }) => ({ courseId: context.input!.courseId }),
            onDone: {
              target: '#courseGeneration.complete',
              actions: [
                assign({
                  generatedLessons: ({ event }) => event.output.lessons,
                  progressPercent: 100,
                  progressMessage: 'Course generation complete!',
                  error: null,
                }),
                courseGenerationTelemetry.completed,
              ],
            },
            onError: {
              target: '#courseGeneration.reviewOutline',
              actions: [
                assign({
                  error: ({ event }) =>
                    createAuthError(
                      'NETWORK_ERROR',
                      event.error instanceof Error ? event.error.message : 'Failed to fetch lessons',
                      true
                    ),
                }),
                courseGenerationTelemetry.failed,
              ],
            },
          },
        },
      },
    },

    // --------------------------------------------------------
    // Complete - generation finished successfully
    // --------------------------------------------------------
    complete: {
      entry: assign({
        currentStep: 'complete' as const,
        progressPercent: 100,
        progressMessage: 'Course generation complete!',
      }),
      on: {
        RESET: {
          target: 'configure',
          actions: assign(initialContext),
        },
      },
    },
  },
});

// ============================================================
// Helper functions
// ============================================================

/**
 * Get human-readable step name
 */
export function getStepLabel(step: CourseGenerationContext['currentStep']): string {
  const labels: Record<CourseGenerationContext['currentStep'], string> = {
    configure: 'Configure',
    'generating-outline': 'Generating Outline',
    'review-outline': 'Review Outline',
    'job-queued': 'Job Queued',
    'generating-lessons': 'Generating Lessons',
    complete: 'Complete',
  };
  return labels[step];
}

/**
 * Get step index for progress indicator
 */
export function getStepIndex(step: CourseGenerationContext['currentStep']): number {
  const steps: CourseGenerationContext['currentStep'][] = [
    'configure',
    'generating-outline',
    'review-outline',
    'job-queued',
    'generating-lessons',
    'complete',
  ];
  return steps.indexOf(step);
}

/**
 * Check if generation is in progress
 */
export function isGenerating(state: { value: unknown }): boolean {
  const value = state.value;
  if (typeof value === 'string') {
    return value === 'generatingOutline' || value === 'generatingLessons' || value === 'jobQueued';
  }
  // Check for nested states (e.g., { generatingLessons: 'polling' })
  if (typeof value === 'object' && value !== null) {
    return 'generatingOutline' in value || 'generatingLessons' in value || 'jobQueued' in value;
  }
  return false;
}

/**
 * Check if in job queued confirmation state
 */
export function isInJobQueuedConfirmation(state: { value: unknown }): boolean {
  const value = state.value;
  if (typeof value === 'object' && value !== null && 'jobQueued' in value) {
    return (value as Record<string, string>).jobQueued === 'confirmation';
  }
  return false;
}

/**
 * Get job status label
 */
export function getJobStatusLabel(status: GenerationJobStatus): string {
  const labels: Record<number, string> = {
    0: 'Unknown',
    1: 'Queued',
    2: 'Processing',
    3: 'Completed',
    4: 'Failed',
    5: 'Cancelled',
  };
  return labels[status] || 'Unknown';
}
