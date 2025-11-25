import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { Course, Persona, LearningObjective, CourseBlock, CourseSection, CourseAssessmentSettings } from '@/types';
import { api } from '../api/apiSlice';

// LibraryEntry type for course listings (matches backend LibraryEntry)
export interface LibraryEntry {
  id: string;
  title: string;
  status: 'draft' | 'published';
  folder: string;
  tags: string[];
  createdAt: string;
  modifiedAt: string;
  createdBy?: string;
  thumbnailPath?: string;
}

// Async thunks for API operations
export const createNewCourse = createAsyncThunk(
  'course/createNew',
  async (courseData: Partial<Course>) => {
    const response = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...courseData,
        // Ensure we have an ID for the course
        id: courseData.id || `course-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create course: ${error}`);
    }
    const result = await response.json();
    return result.data;
  }
);

export const saveCourse = createAsyncThunk(
  'course/save',
  async ({ id, courseData }: { id: string; courseData: Partial<Course> }) => {
    const response = await fetch(`/api/courses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(courseData),
    });
    if (!response.ok) throw new Error('Failed to save course');
    const result = await response.json();
    return result.data;
  }
);

export const loadCourse = createAsyncThunk(
  'course/load',
  async (courseId: string) => {
    const response = await fetch(`/api/courses/${courseId}`);
    if (!response.ok) throw new Error('Failed to load course');
    const result = await response.json();
    return result.data;
  }
);

export const loadCourseLibrary = createAsyncThunk(
  'course/loadLibrary',
  async (filters?: { status?: string; folder?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.folder) params.append('folder', filters.folder);

    const response = await fetch(`/api/courses?${params}`);
    if (!response.ok) throw new Error('Failed to load courses');
    const result = await response.json();
    return result.data;
  }
);

// Prefetch folders for content library
export const prefetchFolders = createAsyncThunk(
  'course/prefetchFolders',
  async (includeCourseCount: boolean = true) => {
    const response = await fetch(`/api/folders?includeCourseCount=${includeCourseCount}`);
    if (!response.ok) throw new Error('Failed to prefetch folders');
    const result = await response.json();
    return result.data;
  }
);

// Prefetch courses for content library
export const prefetchCourses = createAsyncThunk(
  'course/prefetchCourses',
  async () => {
    const response = await fetch('/api/courses');
    if (!response.ok) throw new Error('Failed to prefetch courses');
    const result = await response.json();
    return result.data;
  }
);

export const deleteCourse = createAsyncThunk(
  'course/delete',
  async (courseId: string) => {
    const response = await fetch(`/api/courses/${courseId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete course');
    return courseId;
  }
);

interface CourseState {
  currentCourse: Partial<Course>;
  courses: LibraryEntry[]; // Course listings from library (with tags, folder, etc.)
  folders: any[];
  currentStep: number;
  isGenerating: boolean;
  generatedContent: any;
  courseBlocks: CourseBlock[];
  activeBlockId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  foldersLoaded: boolean;
  coursesLoaded: boolean;
}

const initialState: CourseState = {
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

const courseSlice = createSlice({
  name: 'course',
  initialState,
  reducers: {
    setCourseField: (state, action: PayloadAction<{ field: string; value: any }>) => {
      const { field, value } = action.payload;
      // List of valid fields that can be updated
      const validFields = [
        'title',
        'desiredOutcome',
        'destinationFolder',
        'categoryTags',
        'dataSource',
        'personas',
        'learningObjectives',
        'sections',
        'assessmentSettings'
      ];

      // Type-safe field update with validation
      if (validFields.includes(field) && field in state.currentCourse) {
        // Update the field safely
        (state.currentCourse as Record<string, any>)[field] = value;
      } else {
        console.warn(`Attempting to set invalid or unknown field: ${field}`);
      }
    },
    addPersona: (state, action: PayloadAction<Persona>) => {
      if (!state.currentCourse.personas) {
        state.currentCourse.personas = [];
      }
      state.currentCourse.personas.push(action.payload);
    },
    updatePersona: (state, action: PayloadAction<{ id: string; persona: Partial<Persona> }>) => {
      const { id, persona } = action.payload;
      const index = state.currentCourse.personas?.findIndex(p => p.id === id);
      if (index !== undefined && index !== -1 && state.currentCourse.personas) {
        state.currentCourse.personas[index] = {
          ...state.currentCourse.personas[index],
          ...persona,
        };
      }
    },
    removePersona: (state, action: PayloadAction<string>) => {
      if (state.currentCourse.personas) {
        state.currentCourse.personas = state.currentCourse.personas.filter(
          p => p.id !== action.payload
        );
      }
    },
    setLearningObjectives: (state, action: PayloadAction<LearningObjective[]>) => {
      state.currentCourse.learningObjectives = action.payload;
    },
    setAssessmentSettings: (state, action: PayloadAction<Partial<CourseAssessmentSettings>>) => {
      if (!state.currentCourse.assessmentSettings) {
        state.currentCourse.assessmentSettings = {
          enableEmbeddedKnowledgeChecks: true,
          enableFinalExam: true,
        };
      }
      state.currentCourse.assessmentSettings = {
        ...state.currentCourse.assessmentSettings,
        ...action.payload,
      };
    },
    setCurrentStep: (state, action: PayloadAction<number>) => {
      state.currentStep = action.payload;
    },
    resetCourse: (state) => {
      state.currentCourse = {
        personas: [],
        learningObjectives: [],
        sections: [],
        assessmentSettings: {
          enableEmbeddedKnowledgeChecks: true,
          enableFinalExam: true,
        },
      };
      state.currentStep = 1;
    },
    addCourse: (state, action: PayloadAction<LibraryEntry>) => {
      state.courses.push(action.payload);
    },
    // New block management actions
    addCourseBlock: (state, action: PayloadAction<CourseBlock>) => {
      state.courseBlocks.push(action.payload);
    },
    updateCourseBlock: (state, action: PayloadAction<{ id: string; block: Partial<CourseBlock> }>) => {
      const { id, block } = action.payload;
      const index = state.courseBlocks.findIndex(b => b.id === id);
      if (index !== -1) {
        state.courseBlocks[index] = {
          ...state.courseBlocks[index],
          ...block,
        };
      }
    },
    removeCourseBlock: (state, action: PayloadAction<string>) => {
      state.courseBlocks = state.courseBlocks.filter(b => b.id !== action.payload);
    },
    reorderCourseBlocks: (state, action: PayloadAction<{ fromIndex: number; toIndex: number }>) => {
      const { fromIndex, toIndex } = action.payload;
      const [removed] = state.courseBlocks.splice(fromIndex, 1);
      state.courseBlocks.splice(toIndex, 0, removed);
      // Update order property
      state.courseBlocks.forEach((block, index) => {
        block.order = index;
      });
    },
    setActiveBlockId: (state, action: PayloadAction<string | null>) => {
      state.activeBlockId = action.payload;
    },
    // AI generation actions
    setIsGenerating: (state, action: PayloadAction<boolean>) => {
      state.isGenerating = action.payload;
    },
    setGeneratedContent: (state, action: PayloadAction<any>) => {
      state.generatedContent = action.payload;
    },
    generateCourseSections: (state) => {
      // This will be handled by a thunk or saga, but we set the generating flag
      state.isGenerating = true;
    },
  },
  extraReducers: (builder) => {
    // Create new course
    builder
      .addCase(createNewCourse.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(createNewCourse.fulfilled, (state, action) => {
        state.isSaving = false;
        // Merge the API response with existing state, preserving user input
        state.currentCourse = {
          ...state.currentCourse,
          ...action.payload,
          // Always preserve user input for form fields since they have proper defaults now
          title: state.currentCourse.title || action.payload.title || '',
          desiredOutcome: state.currentCourse.desiredOutcome || action.payload.desiredOutcome || '',
          destinationFolder: state.currentCourse.destinationFolder || action.payload.destinationFolder || '',
          categoryTags: state.currentCourse.categoryTags && state.currentCourse.categoryTags.length > 0
            ? state.currentCourse.categoryTags
            : action.payload.categoryTags || [],
          dataSource: state.currentCourse.dataSource || action.payload.dataSource || 'open-web',
        };
        state.courseBlocks = action.payload.content?.courseBlocks || [];
        // Invalidate old cache flags (legacy support)
        state.coursesLoaded = false;
        state.foldersLoaded = false;
      })
      .addCase(createNewCourse.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.error.message || 'Failed to create course';
      });

    // Save course
    builder
      .addCase(saveCourse.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(saveCourse.fulfilled, (state, action) => {
        state.isSaving = false;
        // Merge the saved course data with current state
        // This ensures we don't lose any user input during the save
        state.currentCourse = {
          ...state.currentCourse,
          ...action.payload,
          // Preserve current user input if API returns empty values
          title: action.payload.title || state.currentCourse.title,
          desiredOutcome: action.payload.desiredOutcome || state.currentCourse.desiredOutcome,
          destinationFolder: action.payload.destinationFolder || state.currentCourse.destinationFolder,
          categoryTags: action.payload.categoryTags?.length > 0
            ? action.payload.categoryTags
            : state.currentCourse.categoryTags,
          dataSource: action.payload.dataSource || state.currentCourse.dataSource,
          personas: action.payload.personas?.length > 0
            ? action.payload.personas
            : state.currentCourse.personas,
          learningObjectives: action.payload.learningObjectives?.length > 0
            ? action.payload.learningObjectives
            : state.currentCourse.learningObjectives,
          assessmentSettings: action.payload.assessmentSettings || state.currentCourse.assessmentSettings,
        };
        state.courseBlocks = action.payload.content?.courseBlocks || state.courseBlocks;
        // Invalidate old cache flags (legacy support)
        state.coursesLoaded = false;
        state.foldersLoaded = false;
      })
      .addCase(saveCourse.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.error.message || 'Failed to save course';
      });

    // Load course
    builder
      .addCase(loadCourse.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadCourse.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentCourse = action.payload;
        state.courseBlocks = action.payload.content?.courseBlocks || [];
        // Map from stored data to current Redux state format
        if (action.payload.settings) {
          state.currentCourse.title = action.payload.settings.title;
          state.currentCourse.desiredOutcome = action.payload.settings.desiredOutcome;
          state.currentCourse.destinationFolder = action.payload.settings.destinationFolder;
          state.currentCourse.categoryTags = action.payload.settings.categoryTags;
          state.currentCourse.dataSource = action.payload.settings.dataSource;
        }
      })
      .addCase(loadCourse.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to load course';
      });

    // Load course library
    builder
      .addCase(loadCourseLibrary.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadCourseLibrary.fulfilled, (state, action) => {
        state.isLoading = false;
        state.courses = action.payload || [];
      })
      .addCase(loadCourseLibrary.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to load courses';
        state.courses = []; // Ensure courses is always an array even on error
      });

    // Delete course
    builder
      .addCase(deleteCourse.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteCourse.fulfilled, (state, action) => {
        state.isLoading = false;
        state.courses = state.courses.filter(c => c.id !== action.payload);
        // Invalidate prefetch cache so content library refetches fresh data
        state.foldersLoaded = false;
        state.coursesLoaded = false;
      })
      .addCase(deleteCourse.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to delete course';
      });

    // Prefetch folders
    builder
      .addCase(prefetchFolders.fulfilled, (state, action) => {
        state.folders = action.payload || [];
        state.foldersLoaded = true;
      })
      .addCase(prefetchFolders.rejected, (state) => {
        // Silent fail for prefetch
        state.foldersLoaded = false;
      });

    // Prefetch courses
    builder
      .addCase(prefetchCourses.fulfilled, (state, action) => {
        state.courses = action.payload || [];
        state.coursesLoaded = true;
      })
      .addCase(prefetchCourses.rejected, (state) => {
        // Silent fail for prefetch
        state.coursesLoaded = false;
      });
  },
});

export const {
  setCourseField,
  addPersona,
  updatePersona,
  removePersona,
  setLearningObjectives,
  setAssessmentSettings,
  setCurrentStep,
  resetCourse,
  addCourse,
  addCourseBlock,
  updateCourseBlock,
  removeCourseBlock,
  reorderCourseBlocks,
  setActiveBlockId,
  setIsGenerating,
  setGeneratedContent,
  generateCourseSections,
} = courseSlice.actions;

export default courseSlice.reducer;
