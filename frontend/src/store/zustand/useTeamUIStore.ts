import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

interface TeamUIState {
  selectedTeamId: string | null;
  isCreateModalOpen: boolean;
  isEditModalOpen: boolean;
  isAddMemberModalOpen: boolean;
  isDetailViewOpen: boolean;
}

interface TeamUIActions {
  selectTeam: (id: string | null) => void;
  clearTeamSelection: () => void;
  openTeamDetailView: (id: string) => void;
  closeTeamDetailView: () => void;
  openTeamCreateModal: () => void;
  closeTeamCreateModal: () => void;
  openTeamEditModal: () => void;
  closeTeamEditModal: () => void;
  openAddMemberModal: () => void;
  closeAddMemberModal: () => void;
  resetTeamState: () => void;
}

type TeamUIStore = TeamUIState & TeamUIActions;

// ============================================================================
// Initial State
// ============================================================================

const initialTeamState: TeamUIState = {
  selectedTeamId: null,
  isCreateModalOpen: false,
  isEditModalOpen: false,
  isAddMemberModalOpen: false,
  isDetailViewOpen: false,
};

// ============================================================================
// Store
// ============================================================================

export const useTeamUIStore = create<TeamUIStore>()(
  devtools(
    (set) => ({
      // State
      ...initialTeamState,

      // Actions
      selectTeam: (id) => set({ selectedTeamId: id }),
      clearTeamSelection: () => set({ selectedTeamId: null, isDetailViewOpen: false }),
      openTeamDetailView: (id) => set({ selectedTeamId: id, isDetailViewOpen: true }),
      closeTeamDetailView: () => set({ isDetailViewOpen: false }),
      openTeamCreateModal: () => set({ isCreateModalOpen: true }),
      closeTeamCreateModal: () => set({ isCreateModalOpen: false }),
      openTeamEditModal: () => set({ isEditModalOpen: true }),
      closeTeamEditModal: () => set({ isEditModalOpen: false }),
      openAddMemberModal: () => set({ isAddMemberModalOpen: true }),
      closeAddMemberModal: () => set({ isAddMemberModalOpen: false }),
      resetTeamState: () => set(initialTeamState),
    }),
    { name: 'team-ui-store' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const useTeamState = () => useTeamUIStore((s) => ({
  selectedTeamId: s.selectedTeamId,
  isCreateModalOpen: s.isCreateModalOpen,
  isEditModalOpen: s.isEditModalOpen,
  isAddMemberModalOpen: s.isAddMemberModalOpen,
  isDetailViewOpen: s.isDetailViewOpen,
}));
export const useSelectedTeamId = () => useTeamUIStore((s) => s.selectedTeamId);
