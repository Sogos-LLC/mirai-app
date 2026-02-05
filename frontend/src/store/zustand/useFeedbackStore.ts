import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

interface FeedbackState {
  isModalOpen: boolean;
}

interface FeedbackActions {
  openFeedbackModal: () => void;
  closeFeedbackModal: () => void;
}

type FeedbackStore = FeedbackState & FeedbackActions;

// ============================================================================
// Store
// ============================================================================

export const useFeedbackStore = create<FeedbackStore>()(
  devtools(
    (set) => ({
      // State
      isModalOpen: false,

      // Actions
      openFeedbackModal: () => set({ isModalOpen: true }),
      closeFeedbackModal: () => set({ isModalOpen: false }),
    }),
    { name: 'feedback-store' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const useFeedbackState = () => useFeedbackStore((s) => ({
  isModalOpen: s.isModalOpen,
}));
export const useFeedbackModalOpen = () => useFeedbackStore((s) => s.isModalOpen);
