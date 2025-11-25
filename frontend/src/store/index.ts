import { configureStore } from '@reduxjs/toolkit';
import courseReducer from './slices/courseSlice';
import uiReducer from './slices/uiSlice';
import aiGenerationReducer from './slices/aiGenerationSlice';
import { persistenceMiddleware, restoreFromLocalStorage } from './middleware/persistenceMiddleware';
import { api } from './api/apiSlice';

// Only restore state on client-side
const getPreloadedState = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const restoredState = restoreFromLocalStorage();
  if (!restoredState) {
    return undefined;
  }

  // Merge restored state with initial state to ensure all required fields exist
  const initialCourseState = {
    currentCourse: {
      title: '',
      desiredOutcome: '',
      destinationFolder: '',
      categoryTags: [],
      dataSource: 'open-web',
      personas: [],
      learningObjectives: [],
      sections: [],
      assessmentSettings: {
        enableEmbeddedKnowledgeChecks: true,
        enableFinalExam: true,
      },
    },
    courses: [],
    folders: [],
    currentStep: 1,
    isGenerating: false,
    generatedContent: null,
    courseBlocks: [],
    activeBlockId: null,
    isLoading: false,
    isSaving: false,
    error: null,
    foldersLoaded: false,
    coursesLoaded: false,
  };

  return {
    course: {
      ...initialCourseState,
      ...restoredState,
      // Ensure currentCourse is properly merged
      currentCourse: {
        ...initialCourseState.currentCourse,
        ...restoredState.currentCourse,
      },
    }
  };
};

const preloadedState = getPreloadedState();

export const store = configureStore({
  reducer: {
    course: courseReducer,
    ui: uiReducer,
    aiGeneration: aiGenerationReducer,
    [api.reducerPath]: api.reducer, // Add RTK Query reducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['course/saveCourse/fulfilled', 'course/loadCourse/fulfilled'],
      },
    })
    .concat(api.middleware) // Add RTK Query middleware
    .concat(persistenceMiddleware),
  preloadedState,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
