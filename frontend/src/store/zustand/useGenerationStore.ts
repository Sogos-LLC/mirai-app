import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type GenerationType = 'objectives' | 'personas' | 'content' | 'blocks' | null;

interface GenerationState {
  isGenerating: boolean;
  generationType: GenerationType;
  progress: number;
  currentMessage: string;
  error: string | null;
}

interface GenerationActions {
  startGeneration: (type: GenerationType) => void;
  updateGenerationProgress: (progress: number, message: string) => void;
  completeGeneration: () => void;
  setGenerationError: (error: string) => void;
  resetGeneration: () => void;
}

type GenerationStore = GenerationState & GenerationActions;

// ============================================================================
// Initial State
// ============================================================================

const initialGenerationState: GenerationState = {
  isGenerating: false,
  generationType: null,
  progress: 0,
  currentMessage: '',
  error: null,
};

// ============================================================================
// Store
// ============================================================================

export const useGenerationStore = create<GenerationStore>()(
  devtools(
    (set) => ({
      // State
      ...initialGenerationState,

      // Actions
      startGeneration: (type) => set({
        isGenerating: true,
        generationType: type,
        progress: 0,
        currentMessage: 'Initializing AI generation...',
        error: null,
      }),
      updateGenerationProgress: (progress, message) => set({
        progress,
        currentMessage: message,
      }),
      completeGeneration: () => set({
        isGenerating: false,
        generationType: null,
        progress: 100,
        currentMessage: 'Generation complete!',
      }),
      setGenerationError: (error) => set({
        isGenerating: false,
        error,
        progress: 0,
      }),
      resetGeneration: () => set(initialGenerationState),
    }),
    { name: 'generation-store' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const useAIGenerationState = () => useGenerationStore((s) => ({
  isGenerating: s.isGenerating,
  generationType: s.generationType,
  progress: s.progress,
  currentMessage: s.currentMessage,
  error: s.error,
}));
export const useIsGenerating = () => useGenerationStore((s) => s.isGenerating);
