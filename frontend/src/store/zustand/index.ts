import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

type SortOrder = 'asc' | 'desc';
type SMESortBy = 'name' | 'createdAt' | 'updatedAt';
type SMEFilterScope = 'all' | 'global' | 'team';
type SMEFilterStatus = 'all' | 'draft' | 'active' | 'archived';
type TargetAudienceSortBy = 'name' | 'createdAt' | 'updatedAt';
type ExperienceLevel = 'all' | 'beginner' | 'intermediate' | 'advanced';
type GenerationType = 'objectives' | 'personas' | 'content' | 'blocks' | null;
type ApiKeyTestStatus = 'idle' | 'testing' | 'success' | 'failed';
type UsageTimeRange = '7d' | '30d' | '90d' | 'all';

// ============================================================================
// UI Store Interface
// ============================================================================

interface UIStore {
  // Layout state (formerly uiSlice)
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  globalLoading: boolean;
  globalError: string | null;

  // Layout actions
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  openMobileSidebar: () => void;
  setGlobalLoading: (loading: boolean) => void;
  setGlobalError: (error: string | null) => void;

  // SME state (formerly smeSlice)
  sme: {
    selectedSMEId: string | null;
    selectedTaskId: string | null;
    isCreateModalOpen: boolean;
    isTaskModalOpen: boolean;
    isUploadModalOpen: boolean;
    sortBy: SMESortBy;
    sortOrder: SortOrder;
    filterScope: SMEFilterScope;
    filterStatus: SMEFilterStatus;
  };

  // SME actions
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

  // Team state (formerly teamSlice)
  team: {
    selectedTeamId: string | null;
    isCreateModalOpen: boolean;
    isEditModalOpen: boolean;
    isAddMemberModalOpen: boolean;
    isDetailViewOpen: boolean;
  };

  // Team actions
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

  // Target Audience state (formerly targetAudienceSlice)
  targetAudience: {
    selectedTemplateId: string | null;
    isCreateModalOpen: boolean;
    isEditModalOpen: boolean;
    sortBy: TargetAudienceSortBy;
    sortOrder: SortOrder;
    filterExperienceLevel: ExperienceLevel;
  };

  // Target Audience actions
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

  // Notification state (formerly notificationSlice)
  notification: {
    isPanelOpen: boolean;
    showUnreadOnly: boolean;
    locallyReadIds: string[];
  };

  // Notification actions
  openNotificationPanel: () => void;
  closeNotificationPanel: () => void;
  toggleNotificationPanel: () => void;
  setShowUnreadOnly: (value: boolean) => void;
  toggleShowUnreadOnly: () => void;
  markLocallyRead: (ids: string[]) => void;
  markAllLocallyRead: () => void;
  clearLocallyRead: () => void;

  // AI Generation state (formerly aiGenerationSlice)
  aiGeneration: {
    isGenerating: boolean;
    generationType: GenerationType;
    progress: number;
    currentMessage: string;
    error: string | null;
  };

  // AI Generation actions
  startGeneration: (type: GenerationType) => void;
  updateGenerationProgress: (progress: number, message: string) => void;
  completeGeneration: () => void;
  setGenerationError: (error: string) => void;
  resetGeneration: () => void;

  // Tenant Settings state (formerly tenantSettingsSlice)
  tenantSettings: {
    isApiKeyModalOpen: boolean;
    isTestingApiKey: boolean;
    apiKeyTestStatus: ApiKeyTestStatus;
    apiKeyTestError: string | null;
    isUsageExpanded: boolean;
    usageTimeRange: UsageTimeRange;
  };

  // Tenant Settings actions
  openApiKeyModal: () => void;
  closeApiKeyModal: () => void;
  startApiKeyTest: () => void;
  apiKeyTestSuccess: () => void;
  apiKeyTestFailed: (error: string) => void;
  resetApiKeyTest: () => void;
  toggleUsageExpanded: () => void;
  setUsageTimeRange: (range: UsageTimeRange) => void;

  // Feedback state
  feedback: {
    isModalOpen: boolean;
  };

  // Feedback actions
  openFeedbackModal: () => void;
  closeFeedbackModal: () => void;
}

// ============================================================================
// Initial States
// ============================================================================

const initialSMEState: UIStore['sme'] = {
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

const initialTeamState: UIStore['team'] = {
  selectedTeamId: null,
  isCreateModalOpen: false,
  isEditModalOpen: false,
  isAddMemberModalOpen: false,
  isDetailViewOpen: false,
};

const initialTargetAudienceState: UIStore['targetAudience'] = {
  selectedTemplateId: null,
  isCreateModalOpen: false,
  isEditModalOpen: false,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  filterExperienceLevel: 'all',
};

const initialNotificationState: UIStore['notification'] = {
  isPanelOpen: false,
  showUnreadOnly: false,
  locallyReadIds: [],
};

const initialAIGenerationState: UIStore['aiGeneration'] = {
  isGenerating: false,
  generationType: null,
  progress: 0,
  currentMessage: '',
  error: null,
};

const initialTenantSettingsState: UIStore['tenantSettings'] = {
  isApiKeyModalOpen: false,
  isTestingApiKey: false,
  apiKeyTestStatus: 'idle',
  apiKeyTestError: null,
  isUsageExpanded: false,
  usageTimeRange: '30d',
};

const initialFeedbackState: UIStore['feedback'] = {
  isModalOpen: false,
};

// ============================================================================
// Store
// ============================================================================

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      // ========================================
      // Layout State & Actions
      // ========================================
      sidebarOpen: true,
      mobileSidebarOpen: false,
      globalLoading: false,
      globalError: null,

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
      closeMobileSidebar: () => set({ mobileSidebarOpen: false }),
      openMobileSidebar: () => set({ mobileSidebarOpen: true }),
      setGlobalLoading: (loading) => set({ globalLoading: loading }),
      setGlobalError: (error) => set({ globalError: error }),

      // ========================================
      // SME State & Actions
      // ========================================
      sme: initialSMEState,

      selectSME: (id) => set((state) => ({
        sme: { ...state.sme, selectedSMEId: id, selectedTaskId: null }
      })),
      selectTask: (id) => set((state) => ({
        sme: { ...state.sme, selectedTaskId: id }
      })),
      clearSMESelection: () => set((state) => ({
        sme: { ...state.sme, selectedSMEId: null, selectedTaskId: null }
      })),
      openSMECreateModal: () => set((state) => ({
        sme: { ...state.sme, isCreateModalOpen: true }
      })),
      closeSMECreateModal: () => set((state) => ({
        sme: { ...state.sme, isCreateModalOpen: false }
      })),
      openSMETaskModal: () => set((state) => ({
        sme: { ...state.sme, isTaskModalOpen: true }
      })),
      closeSMETaskModal: () => set((state) => ({
        sme: { ...state.sme, isTaskModalOpen: false }
      })),
      openSMEUploadModal: () => set((state) => ({
        sme: { ...state.sme, isUploadModalOpen: true }
      })),
      closeSMEUploadModal: () => set((state) => ({
        sme: { ...state.sme, isUploadModalOpen: false }
      })),
      setSMESortBy: (sortBy) => set((state) => ({
        sme: { ...state.sme, sortBy }
      })),
      setSMESortOrder: (sortOrder) => set((state) => ({
        sme: { ...state.sme, sortOrder }
      })),
      toggleSMESortOrder: () => set((state) => ({
        sme: { ...state.sme, sortOrder: state.sme.sortOrder === 'asc' ? 'desc' : 'asc' }
      })),
      setSMEFilterScope: (filterScope) => set((state) => ({
        sme: { ...state.sme, filterScope }
      })),
      setSMEFilterStatus: (filterStatus) => set((state) => ({
        sme: { ...state.sme, filterStatus }
      })),
      resetSMEFilters: () => set((state) => ({
        sme: {
          ...state.sme,
          sortBy: 'createdAt',
          sortOrder: 'desc',
          filterScope: 'all',
          filterStatus: 'all',
        }
      })),

      // ========================================
      // Team State & Actions
      // ========================================
      team: initialTeamState,

      selectTeam: (id) => set((state) => ({
        team: { ...state.team, selectedTeamId: id }
      })),
      clearTeamSelection: () => set((state) => ({
        team: { ...state.team, selectedTeamId: null, isDetailViewOpen: false }
      })),
      openTeamDetailView: (id) => set((state) => ({
        team: { ...state.team, selectedTeamId: id, isDetailViewOpen: true }
      })),
      closeTeamDetailView: () => set((state) => ({
        team: { ...state.team, isDetailViewOpen: false }
      })),
      openTeamCreateModal: () => set((state) => ({
        team: { ...state.team, isCreateModalOpen: true }
      })),
      closeTeamCreateModal: () => set((state) => ({
        team: { ...state.team, isCreateModalOpen: false }
      })),
      openTeamEditModal: () => set((state) => ({
        team: { ...state.team, isEditModalOpen: true }
      })),
      closeTeamEditModal: () => set((state) => ({
        team: { ...state.team, isEditModalOpen: false }
      })),
      openAddMemberModal: () => set((state) => ({
        team: { ...state.team, isAddMemberModalOpen: true }
      })),
      closeAddMemberModal: () => set((state) => ({
        team: { ...state.team, isAddMemberModalOpen: false }
      })),
      resetTeamState: () => set({ team: initialTeamState }),

      // ========================================
      // Target Audience State & Actions
      // ========================================
      targetAudience: initialTargetAudienceState,

      selectTemplate: (id) => set((state) => ({
        targetAudience: { ...state.targetAudience, selectedTemplateId: id }
      })),
      clearTemplateSelection: () => set((state) => ({
        targetAudience: { ...state.targetAudience, selectedTemplateId: null }
      })),
      openTACreateModal: () => set((state) => ({
        targetAudience: { ...state.targetAudience, isCreateModalOpen: true }
      })),
      closeTACreateModal: () => set((state) => ({
        targetAudience: { ...state.targetAudience, isCreateModalOpen: false }
      })),
      openTAEditModal: (id) => set((state) => ({
        targetAudience: { ...state.targetAudience, selectedTemplateId: id, isEditModalOpen: true }
      })),
      closeTAEditModal: () => set((state) => ({
        targetAudience: { ...state.targetAudience, isEditModalOpen: false }
      })),
      setTASortBy: (sortBy) => set((state) => ({
        targetAudience: { ...state.targetAudience, sortBy }
      })),
      setTASortOrder: (sortOrder) => set((state) => ({
        targetAudience: { ...state.targetAudience, sortOrder }
      })),
      toggleTASortOrder: () => set((state) => ({
        targetAudience: {
          ...state.targetAudience,
          sortOrder: state.targetAudience.sortOrder === 'asc' ? 'desc' : 'asc'
        }
      })),
      setTAFilterExperienceLevel: (level) => set((state) => ({
        targetAudience: { ...state.targetAudience, filterExperienceLevel: level }
      })),
      resetTAFilters: () => set((state) => ({
        targetAudience: {
          ...state.targetAudience,
          sortBy: 'createdAt',
          sortOrder: 'desc',
          filterExperienceLevel: 'all',
        }
      })),

      // ========================================
      // Notification State & Actions
      // ========================================
      notification: initialNotificationState,

      openNotificationPanel: () => set((state) => ({
        notification: { ...state.notification, isPanelOpen: true }
      })),
      closeNotificationPanel: () => set((state) => ({
        notification: { ...state.notification, isPanelOpen: false }
      })),
      toggleNotificationPanel: () => set((state) => ({
        notification: { ...state.notification, isPanelOpen: !state.notification.isPanelOpen }
      })),
      setShowUnreadOnly: (value) => set((state) => ({
        notification: { ...state.notification, showUnreadOnly: value }
      })),
      toggleShowUnreadOnly: () => set((state) => ({
        notification: { ...state.notification, showUnreadOnly: !state.notification.showUnreadOnly }
      })),
      markLocallyRead: (ids) => set((state) => ({
        notification: {
          ...state.notification,
          locallyReadIds: [...new Set([...state.notification.locallyReadIds, ...ids])]
        }
      })),
      markAllLocallyRead: () => set((state) => ({
        notification: state.notification // Synced with server via hook
      })),
      clearLocallyRead: () => set((state) => ({
        notification: { ...state.notification, locallyReadIds: [] }
      })),

      // ========================================
      // AI Generation State & Actions
      // ========================================
      aiGeneration: initialAIGenerationState,

      startGeneration: (type) => set({
        aiGeneration: {
          isGenerating: true,
          generationType: type,
          progress: 0,
          currentMessage: 'Initializing AI generation...',
          error: null,
        }
      }),
      updateGenerationProgress: (progress, message) => set((state) => ({
        aiGeneration: { ...state.aiGeneration, progress, currentMessage: message }
      })),
      completeGeneration: () => set((state) => ({
        aiGeneration: {
          ...state.aiGeneration,
          isGenerating: false,
          generationType: null,
          progress: 100,
          currentMessage: 'Generation complete!',
        }
      })),
      setGenerationError: (error) => set((state) => ({
        aiGeneration: {
          ...state.aiGeneration,
          isGenerating: false,
          error,
          progress: 0,
        }
      })),
      resetGeneration: () => set({ aiGeneration: initialAIGenerationState }),

      // ========================================
      // Tenant Settings State & Actions
      // ========================================
      tenantSettings: initialTenantSettingsState,

      openApiKeyModal: () => set((state) => ({
        tenantSettings: {
          ...state.tenantSettings,
          isApiKeyModalOpen: true,
          apiKeyTestStatus: 'idle',
          apiKeyTestError: null,
        }
      })),
      closeApiKeyModal: () => set((state) => ({
        tenantSettings: {
          ...state.tenantSettings,
          isApiKeyModalOpen: false,
          apiKeyTestStatus: 'idle',
          apiKeyTestError: null,
        }
      })),
      startApiKeyTest: () => set((state) => ({
        tenantSettings: {
          ...state.tenantSettings,
          isTestingApiKey: true,
          apiKeyTestStatus: 'testing',
          apiKeyTestError: null,
        }
      })),
      apiKeyTestSuccess: () => set((state) => ({
        tenantSettings: {
          ...state.tenantSettings,
          isTestingApiKey: false,
          apiKeyTestStatus: 'success',
          apiKeyTestError: null,
        }
      })),
      apiKeyTestFailed: (error) => set((state) => ({
        tenantSettings: {
          ...state.tenantSettings,
          isTestingApiKey: false,
          apiKeyTestStatus: 'failed',
          apiKeyTestError: error,
        }
      })),
      resetApiKeyTest: () => set((state) => ({
        tenantSettings: {
          ...state.tenantSettings,
          isTestingApiKey: false,
          apiKeyTestStatus: 'idle',
          apiKeyTestError: null,
        }
      })),
      toggleUsageExpanded: () => set((state) => ({
        tenantSettings: {
          ...state.tenantSettings,
          isUsageExpanded: !state.tenantSettings.isUsageExpanded,
        }
      })),
      setUsageTimeRange: (range) => set((state) => ({
        tenantSettings: { ...state.tenantSettings, usageTimeRange: range }
      })),

      // ========================================
      // Feedback State & Actions
      // ========================================
      feedback: initialFeedbackState,

      openFeedbackModal: () => set((state) => ({
        feedback: { ...state.feedback, isModalOpen: true }
      })),
      closeFeedbackModal: () => set((state) => ({
        feedback: { ...state.feedback, isModalOpen: false }
      })),
    }),
    { name: 'ui-store' }
  )
);

// ============================================================================
// Selectors (for optimized re-renders)
// ============================================================================

// Layout selectors
export const useSidebarOpen = () => useUIStore((s) => s.sidebarOpen);
export const useMobileSidebarOpen = () => useUIStore((s) => s.mobileSidebarOpen);

// SME selectors
export const useSMEState = () => useUIStore((s) => s.sme);
export const useSelectedSMEId = () => useUIStore((s) => s.sme.selectedSMEId);
export const useSelectedTaskId = () => useUIStore((s) => s.sme.selectedTaskId);

// Team selectors
export const useTeamState = () => useUIStore((s) => s.team);
export const useSelectedTeamId = () => useUIStore((s) => s.team.selectedTeamId);

// Target Audience selectors
export const useTargetAudienceState = () => useUIStore((s) => s.targetAudience);

// Notification selectors
export const useNotificationState = () => useUIStore((s) => s.notification);
export const useNotificationPanelOpen = () => useUIStore((s) => s.notification.isPanelOpen);

// AI Generation selectors
export const useAIGenerationState = () => useUIStore((s) => s.aiGeneration);
export const useIsGenerating = () => useUIStore((s) => s.aiGeneration.isGenerating);

// Tenant Settings selectors
export const useTenantSettingsState = () => useUIStore((s) => s.tenantSettings);

// Feedback selectors
export const useFeedbackState = () => useUIStore((s) => s.feedback);
export const useFeedbackModalOpen = () => useUIStore((s) => s.feedback.isModalOpen);
