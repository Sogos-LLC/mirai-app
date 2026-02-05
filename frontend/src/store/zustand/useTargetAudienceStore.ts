import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type TargetAudienceSortBy = 'name' | 'createdAt' | 'updatedAt';
export type ExperienceLevel = 'all' | 'beginner' | 'intermediate' | 'advanced';

// Re-use SortOrder from SME store or define locally for independence
type SortOrder = 'asc' | 'desc';

interface TargetAudienceState {
  selectedTemplateId: string | null;
  isCreateModalOpen: boolean;
  isEditModalOpen: boolean;
  sortBy: TargetAudienceSortBy;
  sortOrder: SortOrder;
  filterExperienceLevel: ExperienceLevel;
}

interface TargetAudienceActions {
  selectTemplate: (id: string | null) => void;
  clearTemplateSelection: () => void;
  openTACreateModal: () => void;
  closeTACreateModal: () => void;
  openTAEditModal: (id: string) => void;
  closeTAEditModal: () => void;
  setTASortBy: (sortBy: TargetAudienceSortBy) => void;
  setTASortOrder: (order: SortOrder) => void;
  toggleTASortOrder: () => void;
  setTAFilterExperienceLevel: (level: ExperienceLevel) => void;
  resetTAFilters: () => void;
}

type TargetAudienceStore = TargetAudienceState & TargetAudienceActions;

// ============================================================================
// Initial State
// ============================================================================

const initialTargetAudienceState: TargetAudienceState = {
  selectedTemplateId: null,
  isCreateModalOpen: false,
  isEditModalOpen: false,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  filterExperienceLevel: 'all',
};

// ============================================================================
// Store
// ============================================================================

export const useTargetAudienceStore = create<TargetAudienceStore>()(
  devtools(
    (set) => ({
      // State
      ...initialTargetAudienceState,

      // Actions
      selectTemplate: (id) => set({ selectedTemplateId: id }),
      clearTemplateSelection: () => set({ selectedTemplateId: null }),
      openTACreateModal: () => set({ isCreateModalOpen: true }),
      closeTACreateModal: () => set({ isCreateModalOpen: false }),
      openTAEditModal: (id) => set({ selectedTemplateId: id, isEditModalOpen: true }),
      closeTAEditModal: () => set({ isEditModalOpen: false }),
      setTASortBy: (sortBy) => set({ sortBy }),
      setTASortOrder: (sortOrder) => set({ sortOrder }),
      toggleTASortOrder: () => set((state) => ({
        sortOrder: state.sortOrder === 'asc' ? 'desc' : 'asc',
      })),
      setTAFilterExperienceLevel: (level) => set({ filterExperienceLevel: level }),
      resetTAFilters: () => set({
        sortBy: 'createdAt',
        sortOrder: 'desc',
        filterExperienceLevel: 'all',
      }),
    }),
    { name: 'target-audience-store' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const useTargetAudienceState = () => useTargetAudienceStore((s) => ({
  selectedTemplateId: s.selectedTemplateId,
  isCreateModalOpen: s.isCreateModalOpen,
  isEditModalOpen: s.isEditModalOpen,
  sortBy: s.sortBy,
  sortOrder: s.sortOrder,
  filterExperienceLevel: s.filterExperienceLevel,
}));
