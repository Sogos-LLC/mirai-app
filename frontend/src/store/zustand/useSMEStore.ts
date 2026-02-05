import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type SortOrder = 'asc' | 'desc';
export type SMESortBy = 'name' | 'createdAt' | 'updatedAt';
export type SMEFilterScope = 'all' | 'global' | 'team';
export type SMEFilterStatus = 'all' | 'draft' | 'active' | 'archived';

interface SMEState {
  selectedSMEId: string | null;
  selectedTaskId: string | null;
  isCreateModalOpen: boolean;
  isTaskModalOpen: boolean;
  isUploadModalOpen: boolean;
  sortBy: SMESortBy;
  sortOrder: SortOrder;
  filterScope: SMEFilterScope;
  filterStatus: SMEFilterStatus;
}

interface SMEActions {
  selectSME: (id: string | null) => void;
  selectTask: (id: string | null) => void;
  clearSMESelection: () => void;
  openSMECreateModal: () => void;
  closeSMECreateModal: () => void;
  openSMETaskModal: () => void;
  closeSMETaskModal: () => void;
  openSMEUploadModal: () => void;
  closeSMEUploadModal: () => void;
  setSMESortBy: (sortBy: SMESortBy) => void;
  setSMESortOrder: (order: SortOrder) => void;
  toggleSMESortOrder: () => void;
  setSMEFilterScope: (scope: SMEFilterScope) => void;
  setSMEFilterStatus: (status: SMEFilterStatus) => void;
  resetSMEFilters: () => void;
}

type SMEStore = SMEState & SMEActions;

// ============================================================================
// Initial State
// ============================================================================

const initialSMEState: SMEState = {
  selectedSMEId: null,
  selectedTaskId: null,
  isCreateModalOpen: false,
  isTaskModalOpen: false,
  isUploadModalOpen: false,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  filterScope: 'all',
  filterStatus: 'all',
};

// ============================================================================
// Store
// ============================================================================

export const useSMEStore = create<SMEStore>()(
  devtools(
    (set) => ({
      // State
      ...initialSMEState,

      // Actions
      selectSME: (id) => set({ selectedSMEId: id, selectedTaskId: null }),
      selectTask: (id) => set({ selectedTaskId: id }),
      clearSMESelection: () => set({ selectedSMEId: null, selectedTaskId: null }),
      openSMECreateModal: () => set({ isCreateModalOpen: true }),
      closeSMECreateModal: () => set({ isCreateModalOpen: false }),
      openSMETaskModal: () => set({ isTaskModalOpen: true }),
      closeSMETaskModal: () => set({ isTaskModalOpen: false }),
      openSMEUploadModal: () => set({ isUploadModalOpen: true }),
      closeSMEUploadModal: () => set({ isUploadModalOpen: false }),
      setSMESortBy: (sortBy) => set({ sortBy }),
      setSMESortOrder: (sortOrder) => set({ sortOrder }),
      toggleSMESortOrder: () => set((state) => ({
        sortOrder: state.sortOrder === 'asc' ? 'desc' : 'asc',
      })),
      setSMEFilterScope: (filterScope) => set({ filterScope }),
      setSMEFilterStatus: (filterStatus) => set({ filterStatus }),
      resetSMEFilters: () => set({
        sortBy: 'createdAt',
        sortOrder: 'desc',
        filterScope: 'all',
        filterStatus: 'all',
      }),
    }),
    { name: 'sme-store' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const useSMEState = () => useSMEStore((s) => ({
  selectedSMEId: s.selectedSMEId,
  selectedTaskId: s.selectedTaskId,
  isCreateModalOpen: s.isCreateModalOpen,
  isTaskModalOpen: s.isTaskModalOpen,
  isUploadModalOpen: s.isUploadModalOpen,
  sortBy: s.sortBy,
  sortOrder: s.sortOrder,
  filterScope: s.filterScope,
  filterStatus: s.filterStatus,
}));
export const useSelectedSMEId = () => useSMEStore((s) => s.selectedSMEId);
export const useSelectedTaskId = () => useSMEStore((s) => s.selectedTaskId);
