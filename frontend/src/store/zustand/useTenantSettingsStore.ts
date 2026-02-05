import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type ApiKeyTestStatus = 'idle' | 'testing' | 'success' | 'failed';
export type UsageTimeRange = '7d' | '30d' | '90d' | 'all';

interface TenantSettingsState {
  isApiKeyModalOpen: boolean;
  isTestingApiKey: boolean;
  apiKeyTestStatus: ApiKeyTestStatus;
  apiKeyTestError: string | null;
  isUsageExpanded: boolean;
  usageTimeRange: UsageTimeRange;
}

interface TenantSettingsActions {
  openApiKeyModal: () => void;
  closeApiKeyModal: () => void;
  startApiKeyTest: () => void;
  apiKeyTestSuccess: () => void;
  apiKeyTestFailed: (error: string) => void;
  resetApiKeyTest: () => void;
  toggleUsageExpanded: () => void;
  setUsageTimeRange: (range: UsageTimeRange) => void;
}

type TenantSettingsStore = TenantSettingsState & TenantSettingsActions;

// ============================================================================
// Initial State
// ============================================================================

const initialTenantSettingsState: TenantSettingsState = {
  isApiKeyModalOpen: false,
  isTestingApiKey: false,
  apiKeyTestStatus: 'idle',
  apiKeyTestError: null,
  isUsageExpanded: false,
  usageTimeRange: '30d',
};

// ============================================================================
// Store
// ============================================================================

export const useTenantSettingsStore = create<TenantSettingsStore>()(
  devtools(
    (set) => ({
      // State
      ...initialTenantSettingsState,

      // Actions
      openApiKeyModal: () => set({
        isApiKeyModalOpen: true,
        apiKeyTestStatus: 'idle',
        apiKeyTestError: null,
      }),
      closeApiKeyModal: () => set({
        isApiKeyModalOpen: false,
        apiKeyTestStatus: 'idle',
        apiKeyTestError: null,
      }),
      startApiKeyTest: () => set({
        isTestingApiKey: true,
        apiKeyTestStatus: 'testing',
        apiKeyTestError: null,
      }),
      apiKeyTestSuccess: () => set({
        isTestingApiKey: false,
        apiKeyTestStatus: 'success',
        apiKeyTestError: null,
      }),
      apiKeyTestFailed: (error) => set({
        isTestingApiKey: false,
        apiKeyTestStatus: 'failed',
        apiKeyTestError: error,
      }),
      resetApiKeyTest: () => set({
        isTestingApiKey: false,
        apiKeyTestStatus: 'idle',
        apiKeyTestError: null,
      }),
      toggleUsageExpanded: () => set((state) => ({
        isUsageExpanded: !state.isUsageExpanded,
      })),
      setUsageTimeRange: (range) => set({ usageTimeRange: range }),
    }),
    { name: 'tenant-settings-store' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const useTenantSettingsState = () => useTenantSettingsStore((s) => ({
  isApiKeyModalOpen: s.isApiKeyModalOpen,
  isTestingApiKey: s.isTestingApiKey,
  apiKeyTestStatus: s.apiKeyTestStatus,
  apiKeyTestError: s.apiKeyTestError,
  isUsageExpanded: s.isUsageExpanded,
  usageTimeRange: s.usageTimeRange,
}));
