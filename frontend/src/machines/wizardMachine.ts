/**
 * wizardMachine — XState v5 machine for the simplified 4-step course creation wizard.
 *
 * 4 input-collection steps with AI generation between steps:
 *   step1_title → generatingOutcomes → step2_outcomes
 *   → generatingPersonas → step3_teacherStudent → step4_context → completed
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
} from '@/gen/mirai/v1/course_wizard_pb';

// ============================================================
// Context
// ============================================================

export type ContextUploadStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'error';

export interface WizardContext {
  // Step 1
  courseTitle: string;

  // Step 2 (generated + editable)
  outcomes: string;

  // Step 3 (generated + editable)
  teacher: SMEPersona | null;
  student: AudiencePersona | null;

  // Step 4
  contextText: string;
  contextFile: File | null;
  contextFileName: string;
  contextSourceId: string;
  contextUploadStatus: ContextUploadStatus;
  contextUploadError: string;

  // UI state
  currentStep: number;
  error: string | null;
}

// ============================================================
// Events
// ============================================================

export type WizardEvent =
  | { type: 'SET_COURSE_TITLE'; value: string }
  | { type: 'SET_OUTCOMES'; value: string }
  | { type: 'SET_TEACHER'; teacher: SMEPersona }
  | { type: 'SET_STUDENT'; student: AudiencePersona }
  | { type: 'SET_CONTEXT_TEXT'; value: string }
  | { type: 'SET_CONTEXT_FILE'; file: File | null; fileName: string }
  | { type: 'CONTEXT_UPLOAD_START' }
  | { type: 'CONTEXT_UPLOAD_DONE'; sourceId: string }
  | { type: 'CONTEXT_INGESTION_READY' }
  | { type: 'CONTEXT_UPLOAD_ERROR'; error: string }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'COMPLETE' }
  | { type: 'DISMISS_ERROR' }
  | { type: 'CANCEL' };

// ============================================================
// Initial Context
// ============================================================

export const initialWizardContext: WizardContext = {
  courseTitle: '',
  outcomes: '',
  teacher: null,
  student: null,
  contextText: '',
  contextFile: null,
  contextFileName: '',
  contextSourceId: '',
  contextUploadStatus: 'idle',
  contextUploadError: '',
  currentStep: 1,
  error: null,
};

// ============================================================
// Actor stubs (provided by component via .provide())
// ============================================================

export const generateOutcomesActor = fromPromise<string, { courseTitle: string }>(
  async () => { throw new Error('generateOutcomesActor must be provided'); }
);

export const generatePersonasActor = fromPromise<
  { teacher: SMEPersona; student: AudiencePersona },
  { courseTitle: string; outcomes: string }
>(async () => { throw new Error('generatePersonasActor must be provided'); });

// ============================================================
// Machine
// ============================================================

export const wizardMachine = createMachine({
  id: 'wizard',
  initial: 'step1_title',
  context: initialWizardContext,
  types: {} as {
    context: WizardContext;
    events: WizardEvent;
  },
  on: {
    DISMISS_ERROR: {
      actions: assign({ error: null }),
    },
    SET_COURSE_TITLE: {
      actions: assign({ courseTitle: ({ event }) => event.value }),
    },
    SET_OUTCOMES: {
      actions: assign({ outcomes: ({ event }) => event.value }),
    },
    SET_TEACHER: {
      actions: assign({ teacher: ({ event }) => event.teacher }),
    },
    SET_STUDENT: {
      actions: assign({ student: ({ event }) => event.student }),
    },
    SET_CONTEXT_TEXT: {
      actions: assign({ contextText: ({ event }) => event.value }),
    },
    SET_CONTEXT_FILE: {
      actions: assign(({ context, event }) => ({
        contextFile: event.file,
        contextFileName: event.fileName,
        // Reset upload tracking when file is cleared
        contextSourceId: event.file ? context.contextSourceId : '',
        contextUploadStatus: event.file ? context.contextUploadStatus : 'idle' as const,
        contextUploadError: event.file ? context.contextUploadError : '',
      })),
    },
    CONTEXT_UPLOAD_START: {
      actions: assign({
        contextUploadStatus: 'uploading' as const,
        contextUploadError: '',
      }),
    },
    CONTEXT_UPLOAD_DONE: {
      actions: assign({
        contextUploadStatus: 'processing' as const,
        contextSourceId: ({ event }) => event.sourceId,
      }),
    },
    CONTEXT_INGESTION_READY: {
      actions: assign({
        contextUploadStatus: 'ready' as const,
      }),
    },
    CONTEXT_UPLOAD_ERROR: {
      actions: assign({
        contextUploadStatus: 'error' as const,
        contextUploadError: ({ event }) => event.error,
      }),
    },
  },
  states: {
    step1_title: {
      on: {
        NEXT: {
          guard: ({ context }) => context.courseTitle.trim().length > 0,
          target: 'generatingOutcomes',
        },
      },
    },

    generatingOutcomes: {
      entry: assign({ currentStep: 2 }),
      invoke: {
        id: 'generateOutcomes',
        src: 'generateOutcomesActor',
        input: ({ context }) => ({
          courseTitle: context.courseTitle,
        }),
        onDone: {
          target: 'step2_outcomes',
          actions: assign({
            outcomes: ({ event }) => event.output,
            currentStep: 2,
          }),
        },
        onError: {
          target: 'step1_title',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : 'Failed to generate outcomes',
            currentStep: 1,
          }),
        },
      },
    },

    step2_outcomes: {
      on: {
        BACK: {
          target: 'step1_title',
          actions: assign({ currentStep: 1 }),
        },
        NEXT: {
          guard: ({ context }) => context.outcomes.trim().length > 0,
          target: 'generatingPersonas',
        },
      },
    },

    generatingPersonas: {
      entry: assign({ currentStep: 3 }),
      invoke: {
        id: 'generatePersonas',
        src: 'generatePersonasActor',
        input: ({ context }) => ({
          courseTitle: context.courseTitle,
          outcomes: context.outcomes,
        }),
        onDone: {
          target: 'step3_teacherStudent',
          actions: assign({
            teacher: ({ event }) => event.output.teacher,
            student: ({ event }) => event.output.student,
            currentStep: 3,
          }),
        },
        onError: {
          target: 'step2_outcomes',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : 'Failed to generate personas',
            currentStep: 2,
          }),
        },
      },
    },

    step3_teacherStudent: {
      on: {
        BACK: {
          target: 'step2_outcomes',
          actions: assign({ currentStep: 2 }),
        },
        NEXT: {
          guard: ({ context }) => context.teacher !== null && context.student !== null,
          target: 'step4_context',
          actions: assign({ currentStep: 4 }),
        },
      },
    },

    step4_context: {
      on: {
        BACK: {
          target: 'step3_teacherStudent',
          actions: assign({ currentStep: 3 }),
        },
        COMPLETE: {
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
  1: 'topic',
  2: 'outcomes',
  3: 'teacherStudent',
  4: 'context',
};

export function stepNumberToName(step: number): string {
  return STEP_NAMES[step] ?? 'topic';
}

export function stepNameToNumber(name: string): number {
  const entry = Object.entries(STEP_NAMES).find(([, v]) => v === name);
  return entry ? parseInt(entry[0], 10) : 1;
}

export const TOTAL_WIZARD_STEPS = 4;
