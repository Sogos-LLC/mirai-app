import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AIGenerationState {
  isGenerating: boolean;
  generationType: 'objectives' | 'personas' | 'content' | 'blocks' | null;
  progress: number;
  currentMessage: string;
  error: string | null;
}

const initialState: AIGenerationState = {
  isGenerating: false,
  generationType: null,
  progress: 0,
  currentMessage: '',
  error: null,
};

const aiGenerationSlice = createSlice({
  name: 'aiGeneration',
  initialState,
  reducers: {
    startGeneration: (state, action: PayloadAction<{ type: AIGenerationState['generationType'] }>) => {
      state.isGenerating = true;
      state.generationType = action.payload.type;
      state.progress = 0;
      state.currentMessage = 'Initializing AI generation...';
      state.error = null;
    },
    updateProgress: (state, action: PayloadAction<{ progress: number; message: string }>) => {
      state.progress = action.payload.progress;
      state.currentMessage = action.payload.message;
    },
    completeGeneration: (state) => {
      state.isGenerating = false;
      state.generationType = null;
      state.progress = 100;
      state.currentMessage = 'Generation complete!';
    },
    setGenerationError: (state, action: PayloadAction<string>) => {
      state.isGenerating = false;
      state.error = action.payload;
      state.progress = 0;
    },
    resetGeneration: (state) => {
      return initialState;
    },
  },
});

export const {
  startGeneration,
  updateProgress,
  completeGeneration,
  setGenerationError,
  resetGeneration,
} = aiGenerationSlice.actions;

export default aiGenerationSlice.reducer;