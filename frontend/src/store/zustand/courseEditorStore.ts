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
  saveEditModal: (contentJson: string) => void;

  // Save state actions
  markDirty: () => void;
  markClean: () => void;
  setSaving: (saving: boolean) => void;

  // Reset
  reset: () => void;
}

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

// Callback for saving edits - set by the editor page
let onSaveCallback: ((componentId: string, contentJson: string) => void) | null = null;

export const setOnSaveCallback = (callback: (componentId: string, contentJson: string) => void) => {
  onSaveCallback = callback;
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

      saveEditModal: (contentJson) => {
        const { editingComponent } = get();
        if (!editingComponent) return;

        // Call the save callback to update local state
        onSaveCallback?.(editingComponent.component.id, contentJson);

        // Close modal and mark dirty
        set({ editingComponent: null, isDirty: true });
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
