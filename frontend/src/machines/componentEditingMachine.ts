import { createMachine, assign, fromPromise } from 'xstate';
import type {
  LessonComponent,
  GeneratedLesson,
  GenerationJob,
} from '@/gen/mirai/v1/ai_generation_types_pb';
import type { LessonComponentType } from '@/gen/mirai/v1/component_enums_pb';
import { componentEditingTelemetry } from './shared/telemetry';
import { NetworkError, createAuthError, type AuthError } from './shared/types';

// ============================================================
// Types
// ============================================================

export interface ComponentEditingContext {
  // Lesson context
  courseId: string | null;
  lesson: GeneratedLesson | null;

  // Component being edited
  activeComponent: LessonComponent | null;
  originalContent: string | null; // JSON string of original content

  // Editing state
  editedContent: string | null; // JSON string of edited content
  modificationPrompt: string;

  // Regeneration
  regenerationJob: GenerationJob | null;

  // History for undo
  history: string[]; // Stack of previous content states

  // Error handling
  error: AuthError | null;
  flowStartedAt: number | null;
}

export type ComponentEditingEvent =
  // Selection
  | { type: 'SELECT_COMPONENT'; component: LessonComponent; lesson: GeneratedLesson; courseId: string }
  | { type: 'DESELECT_COMPONENT' }
  // Editing
  | { type: 'UPDATE_CONTENT'; content: string }
  | { type: 'SET_MODIFICATION_PROMPT'; prompt: string }
  | { type: 'UNDO' }
  | { type: 'RESET_TO_ORIGINAL' }
  // Save/Regenerate
  | { type: 'SAVE' }
  | { type: 'REGENERATE' }
  | { type: 'POLL_REGENERATION' }
  | { type: 'CANCEL_REGENERATION' }
  // Common
  | { type: 'RETRY' }
  | { type: 'DISMISS_ERROR' };

// API Response types
interface SaveComponentResponse {
  component: LessonComponent;
}

interface RegenerateComponentResponse {
  job: GenerationJob;
}

interface GetJobResponse {
  job: GenerationJob;
}

interface GetLessonResponse {
  lesson: GeneratedLesson;
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

const initialContext: ComponentEditingContext = {
  courseId: null,
  lesson: null,
  activeComponent: null,
  originalContent: null,
  editedContent: null,
  modificationPrompt: '',
  regenerationJob: null,
  history: [],
  error: null,
  flowStartedAt: null,
};

// ============================================================
// Actor Definitions
// ============================================================

/**
 * Save component actor
 */
export const saveComponentActor = fromPromise<
  SaveComponentResponse,
  { courseId: string; lessonId: string; componentId: string; content: string }
>(async ({ input }) => {
  throw new NetworkError('saveComponentActor must be provided by the component');
});

/**
 * Regenerate component actor
 */
export const regenerateComponentActor = fromPromise<
  RegenerateComponentResponse,
  { courseId: string; lessonId: string; componentId: string; modificationPrompt: string }
>(async ({ input }) => {
  throw new NetworkError('regenerateComponentActor must be provided by the component');
});

/**
 * Poll job status actor
 */
export const pollJobActor = fromPromise<GetJobResponse, { jobId: string }>(async ({ input }) => {
  throw new NetworkError('pollJobActor must be provided by the component');
});

/**
 * Get updated lesson actor (to refresh component after regeneration)
 */
export const getLessonActor = fromPromise<GetLessonResponse, { lessonId: string }>(async ({ input }) => {
  throw new NetworkError('getLessonActor must be provided by the component');
});

// ============================================================
// Machine Definition
// ============================================================

export const componentEditingMachine = createMachine({
  id: 'componentEditing',
  initial: 'idle',
  context: initialContext,
  types: {} as {
    context: ComponentEditingContext;
    events: ComponentEditingEvent;
  },
  states: {
    // --------------------------------------------------------
    // Idle - no component selected
    // --------------------------------------------------------
    idle: {
      on: {
        SELECT_COMPONENT: {
          target: 'editing',
          actions: [
            assign({
              courseId: ({ event }) => event.courseId,
              lesson: ({ event }) => event.lesson,
              activeComponent: ({ event }) => event.component,
              originalContent: ({ event }) => event.component.contentJson,
              editedContent: ({ event }) => event.component.contentJson,
              modificationPrompt: '',
              history: [],
              error: null,
              flowStartedAt: () => Date.now(),
            }),
            componentEditingTelemetry.started,
          ],
        },
      },
    },

    // --------------------------------------------------------
    // Editing - actively editing a component
    // --------------------------------------------------------
    editing: {
      initial: 'active',
      states: {
        active: {
          on: {
            UPDATE_CONTENT: {
              actions: assign({
                // Push current content to history before updating
                history: ({ context }) =>
                  context.editedContent ? [...context.history, context.editedContent] : context.history,
                editedContent: ({ event }) => event.content,
                error: null,
              }),
            },
            SET_MODIFICATION_PROMPT: {
              actions: assign({
                modificationPrompt: ({ event }) => event.prompt,
              }),
            },
            UNDO: {
              guard: ({ context }) => context.history.length > 0,
              actions: assign({
                editedContent: ({ context }) => context.history[context.history.length - 1] || context.originalContent,
                history: ({ context }) => context.history.slice(0, -1),
              }),
            },
            RESET_TO_ORIGINAL: {
              actions: assign({
                editedContent: ({ context }) => context.originalContent,
                history: [],
              }),
            },
            SAVE: {
              target: 'saving',
              guard: ({ context }) =>
                context.editedContent !== null &&
                context.editedContent !== context.originalContent,
            },
            REGENERATE: {
              target: 'regenerating',
              guard: ({ context }) => context.modificationPrompt.trim().length > 0,
            },
            DESELECT_COMPONENT: '#componentEditing.idle',
          },
        },
        saving: {
          invoke: {
            id: 'saveComponent',
            src: saveComponentActor,
            input: ({ context }) => ({
              courseId: context.courseId!,
              lessonId: context.lesson!.id,
              componentId: context.activeComponent!.id,
              content: context.editedContent!,
            }),
            onDone: {
              target: 'active',
              actions: [
                assign({
                  activeComponent: ({ event }) => event.output.component,
                  originalContent: ({ event }) => event.output.component.contentJson,
                  history: [],
                  error: null,
                }),
                componentEditingTelemetry.saved,
              ],
            },
            onError: {
              target: 'active',
              actions: [
                assign({
                  error: ({ event }) =>
                    createAuthError(
                      'NETWORK_ERROR',
                      event.error instanceof Error ? event.error.message : 'Failed to save component',
                      true
                    ),
                }),
                componentEditingTelemetry.failed,
              ],
            },
          },
        },
        regenerating: {
          initial: 'submitting',
          entry: componentEditingTelemetry.regenerating,
          states: {
            submitting: {
              invoke: {
                id: 'regenerateComponent',
                src: regenerateComponentActor,
                input: ({ context }) => ({
                  courseId: context.courseId!,
                  lessonId: context.lesson!.id,
                  componentId: context.activeComponent!.id,
                  modificationPrompt: context.modificationPrompt,
                }),
                onDone: {
                  target: 'polling',
                  actions: assign({
                    regenerationJob: ({ event }) => event.output.job,
                  }),
                },
                onError: {
                  target: '#componentEditing.editing.active',
                  actions: [
                    assign({
                      error: ({ event }) =>
                        createAuthError(
                          'NETWORK_ERROR',
                          event.error instanceof Error ? event.error.message : 'Failed to start regeneration',
                          true
                        ),
                    }),
                    componentEditingTelemetry.failed,
                  ],
                },
              },
            },
            polling: {
              invoke: {
                id: 'pollRegenerationJob',
                src: pollJobActor,
                input: ({ context }) => ({ jobId: context.regenerationJob!.id }),
                onDone: [
                  {
                    // Job completed - fetch updated lesson
                    target: 'fetchingLesson',
                    guard: ({ event }) => event.output.job.status === JOB_STATUS.COMPLETED,
                    actions: assign({
                      regenerationJob: ({ event }) => event.output.job,
                    }),
                  },
                  {
                    // Job failed
                    target: '#componentEditing.editing.active',
                    guard: ({ event }) => event.output.job.status === JOB_STATUS.FAILED,
                    actions: [
                      assign({
                        regenerationJob: ({ event }) => event.output.job,
                        error: ({ event }) =>
                          createAuthError(
                            'NETWORK_ERROR',
                            event.output.job.errorMessage || 'Regeneration failed',
                            true
                          ),
                      }),
                      componentEditingTelemetry.failed,
                    ],
                  },
                  {
                    // Still processing
                    target: 'waiting',
                    actions: assign({
                      regenerationJob: ({ event }) => event.output.job,
                    }),
                  },
                ],
                onError: {
                  target: '#componentEditing.editing.active',
                  actions: [
                    assign({
                      error: ({ event }) =>
                        createAuthError(
                          'NETWORK_ERROR',
                          event.error instanceof Error ? event.error.message : 'Failed to poll job status',
                          true
                        ),
                    }),
                    componentEditingTelemetry.failed,
                  ],
                },
              },
            },
            waiting: {
              after: {
                2000: 'polling',
              },
              on: {
                CANCEL_REGENERATION: '#componentEditing.editing.active',
              },
            },
            fetchingLesson: {
              invoke: {
                id: 'getLesson',
                src: getLessonActor,
                input: ({ context }) => ({ lessonId: context.lesson!.id }),
                onDone: {
                  target: '#componentEditing.editing.active',
                  actions: [
                    assign(({ context, event }) => {
                      // Find the regenerated component in the updated lesson
                      const updatedComponent = event.output.lesson.components.find(
                        (c: LessonComponent) => c.id === context.activeComponent!.id
                      );
                      return {
                        lesson: event.output.lesson,
                        activeComponent: updatedComponent || context.activeComponent,
                        originalContent: updatedComponent?.contentJson || context.originalContent,
                        editedContent: updatedComponent?.contentJson || context.editedContent,
                        modificationPrompt: '',
                        regenerationJob: null,
                        history: [],
                        error: null,
                      };
                    }),
                    componentEditingTelemetry.saved,
                  ],
                },
                onError: {
                  target: '#componentEditing.editing.active',
                  actions: [
                    assign({
                      error: ({ event }) =>
                        createAuthError(
                          'NETWORK_ERROR',
                          event.error instanceof Error ? event.error.message : 'Failed to fetch updated lesson',
                          true
                        ),
                    }),
                    componentEditingTelemetry.failed,
                  ],
                },
              },
            },
          },
        },
      },
      on: {
        DISMISS_ERROR: {
          actions: assign({ error: null }),
        },
      },
    },
  },
});

// ============================================================
// Helper functions
// ============================================================

/**
 * Check if there are unsaved changes
 */
export function hasUnsavedChanges(context: ComponentEditingContext): boolean {
  return context.editedContent !== null && context.editedContent !== context.originalContent;
}

/**
 * Check if undo is available
 */
export function canUndo(context: ComponentEditingContext): boolean {
  return context.history.length > 0;
}

/**
 * Get component type label
 */
export function getComponentTypeLabel(type: LessonComponentType): string {
  const labels: Record<number, string> = {
    0: 'Unknown',
    1: 'Text',
    2: 'Heading',
    3: 'Image',
    4: 'Quiz',
  };
  return labels[type] || 'Unknown';
}

/**
 * Check if component is being saved or regenerated
 */
export function isProcessing(state: { value: unknown }): boolean {
  const value = state.value;
  if (typeof value === 'object' && value !== null) {
    const stateValue = value as Record<string, unknown>;
    if ('editing' in stateValue) {
      const editing = stateValue.editing;
      return editing === 'saving' || typeof editing === 'object';
    }
  }
  return false;
}

/**
 * Parse component content JSON
 */
export function parseComponentContent<T>(contentJson: string): T | null {
  try {
    return JSON.parse(contentJson) as T;
  } catch {
    return null;
  }
}

/**
 * Stringify component content
 */
export function stringifyComponentContent<T>(content: T): string {
  return JSON.stringify(content, null, 2);
}
