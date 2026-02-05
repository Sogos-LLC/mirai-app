import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

interface NotificationUIState {
  isPanelOpen: boolean;
  showUnreadOnly: boolean;
  locallyReadIds: string[];
}

interface NotificationUIActions {
  openNotificationPanel: () => void;
  closeNotificationPanel: () => void;
  toggleNotificationPanel: () => void;
  setShowUnreadOnly: (value: boolean) => void;
  toggleShowUnreadOnly: () => void;
  markLocallyRead: (ids: string[]) => void;
  markAllLocallyRead: () => void;
  clearLocallyRead: () => void;
}

type NotificationUIStore = NotificationUIState & NotificationUIActions;

// ============================================================================
// Initial State
// ============================================================================

const initialNotificationState: NotificationUIState = {
  isPanelOpen: false,
  showUnreadOnly: false,
  locallyReadIds: [],
};

// ============================================================================
// Store
// ============================================================================

export const useNotificationUIStore = create<NotificationUIStore>()(
  devtools(
    (set) => ({
      // State
      ...initialNotificationState,

      // Actions
      openNotificationPanel: () => set({ isPanelOpen: true }),
      closeNotificationPanel: () => set({ isPanelOpen: false }),
      toggleNotificationPanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
      setShowUnreadOnly: (value) => set({ showUnreadOnly: value }),
      toggleShowUnreadOnly: () => set((state) => ({ showUnreadOnly: !state.showUnreadOnly })),
      markLocallyRead: (ids) => set((state) => ({
        locallyReadIds: [...new Set([...state.locallyReadIds, ...ids])],
      })),
      markAllLocallyRead: () => set((state) => state), // Synced with server via hook
      clearLocallyRead: () => set({ locallyReadIds: [] }),
    }),
    { name: 'notification-ui-store' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const useNotificationState = () => useNotificationUIStore((s) => ({
  isPanelOpen: s.isPanelOpen,
  showUnreadOnly: s.showUnreadOnly,
  locallyReadIds: s.locallyReadIds,
}));
export const useNotificationPanelOpen = () => useNotificationUIStore((s) => s.isPanelOpen);
