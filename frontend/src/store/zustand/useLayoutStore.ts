import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

interface LayoutState {
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  globalLoading: boolean;
  globalError: string | null;
}

interface LayoutActions {
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  openMobileSidebar: () => void;
  setGlobalLoading: (loading: boolean) => void;
  setGlobalError: (error: string | null) => void;
}

type LayoutStore = LayoutState & LayoutActions;

// ============================================================================
// Store
// ============================================================================

export const useLayoutStore = create<LayoutStore>()(
  devtools(
    (set) => ({
      // State
      sidebarOpen: true,
      mobileSidebarOpen: false,
      globalLoading: false,
      globalError: null,

      // Actions
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
      closeMobileSidebar: () => set({ mobileSidebarOpen: false }),
      openMobileSidebar: () => set({ mobileSidebarOpen: true }),
      setGlobalLoading: (loading) => set({ globalLoading: loading }),
      setGlobalError: (error) => set({ globalError: error }),
    }),
    { name: 'layout-store' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const useSidebarOpen = () => useLayoutStore((s) => s.sidebarOpen);
export const useMobileSidebarOpen = () => useLayoutStore((s) => s.mobileSidebarOpen);
