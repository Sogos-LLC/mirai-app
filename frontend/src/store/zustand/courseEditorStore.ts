import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { LessonComponent } from '@/gen/mirai/v1/ai_generation_pb';

// ============================================================================
// Course Editor UI State
// ============================================================================
// This store holds ONLY ephemeral UI state for the course editor.
//
// Architecture:
// - Server Data → Connect-Query (courses, personas, blocks - everything persisted)
// - Wizard Flow → XState (steps, selections, generation states)
// - UI State → Zustand (this store - activeBlockId, save state, modals)

export interface EditingComponent {
  courseId: string;
  generatedLessonId: string;
  component: LessonComponent;
}

interface CourseEditorUIState {
  // Editor UI state
  activeBlockId: string | null;

  // Modal editing state
  editingComponent: EditingComponent | null;

  // Save state tracking
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: number | null;
}

interface CourseEditorUIActions {
  // Editor UI actions
  setActiveBlockId: (id: string | null) => void;

  // Modal editing actions
  openEditModal: (courseId: string, generatedLessonId: string, component: LessonComponent) => void;
  closeEditModal: () => void;
  saveEditModal: (contentJson: string) => Promise<void>;

  // Save state actions
  markDirty: () => void;
  markClean: () => void;
  setSaving: (saving: boolean) => void;

  // Reset
  reset: () => void;
}

// Callback type for persisting component changes to the database
export type PersistComponentCallback = (componentId: string, contentJson: string) => Promise<void>;

type CourseEditorUIStore = CourseEditorUIState & CourseEditorUIActions;

// ============================================================================
// Initial State
// ============================================================================

const initialState: CourseEditorUIState = {
  activeBlockId: null,
  editingComponent: null,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
};

// ============================================================================
// Store
// ============================================================================

// Callback for saving edits to local state - set by the editor page
let onSaveCallback: ((componentId: string, contentJson: string) => void) | null = null;

// Callback for persisting changes to the database - set by the editor page
let onPersistCallback: PersistComponentCallback | null = null;

// Callback to notify editor of successful persist (to reset local hasChanges)
let onPersistSuccessCallback: (() => void) | null = null;

export const setOnSaveCallback = (callback: (componentId: string, contentJson: string) => void) => {
  onSaveCallback = callback;
};

export const setOnPersistCallback = (callback: PersistComponentCallback) => {
  onPersistCallback = callback;
};

export const setOnPersistSuccessCallback = (callback: () => void) => {
  onPersistSuccessCallback = callback;
};

export const useCourseEditorStore = create<CourseEditorUIStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Editor UI actions
      setActiveBlockId: (id) => set({ activeBlockId: id }),

      // Modal editing actions
      openEditModal: (courseId, generatedLessonId, component) => {
        set({ editingComponent: { courseId, generatedLessonId, component } });
      },

      closeEditModal: () => {
        set({ editingComponent: null });
      },

      saveEditModal: async (contentJson) => {
        const { editingComponent } = get();
        if (!editingComponent) return;

        // Call the save callback to update local state
        onSaveCallback?.(editingComponent.component.id, contentJson);

        // Close modal and mark saving state
        set({ editingComponent: null, isSaving: true });

        // Persist to database immediately for consistency
        try {
          await onPersistCallback?.(editingComponent.component.id, contentJson);
          // Mark clean after successful persist
          set({ isDirty: false, isSaving: false, lastSavedAt: Date.now() });
          // Notify editor page of successful persist
          onPersistSuccessCallback?.();
        } catch (error) {
          console.error('Failed to persist component:', error);
          // Mark dirty so user knows they need to save manually
          set({ isDirty: true, isSaving: false });
        }
      },

      // Save state actions
      markDirty: () => set({ isDirty: true }),
      markClean: () => set({ isDirty: false, lastSavedAt: Date.now() }),
      setSaving: (saving) => set({ isSaving: saving }),

      // Reset
      reset: () => set(initialState),
    }),
    { name: 'course-editor-ui' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const useActiveBlockId = () => useCourseEditorStore((s) => s.activeBlockId);
export const useEditingComponent = () => useCourseEditorStore((s) => s.editingComponent);
export const useIsDirty = () => useCourseEditorStore((s) => s.isDirty);
export const useIsSaving = () => useCourseEditorStore((s) => s.isSaving);
