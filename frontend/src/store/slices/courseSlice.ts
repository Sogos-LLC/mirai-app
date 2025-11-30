import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import * as courseClient from '@/lib/courseClient';
import type {
  Course,
  Persona,
  LearningObjective,
  CourseBlock,
  CourseAssessmentSettings,
  LibraryEntry,
  FolderNode,
} from '@/schemas';

// Helper to convert proto course to frontend format
function protoToFrontendCourse(protoCourse: any): any {
  if (!protoCourse) return null;
  return {
    id: protoCourse.id,
    version: protoCourse.version,
    status: protoCourse.status,
    settings: protoCourse.settings ? {
      title: protoCourse.settings.title,
      desiredOutcome: protoCourse.settings.desiredOutcome,
      destinationFolder: protoCourse.settings.destinationFolder,
      categoryTags: protoCourse.settings.categoryTags || [],
      dataSource: protoCourse.settings.dataSource,
    } : undefined,
    title: protoCourse.settings?.title,
    desiredOutcome: protoCourse.settings?.desiredOutcome,
    destinationFolder: protoCourse.settings?.destinationFolder,
    categoryTags: protoCourse.settings?.categoryTags || [],
    dataSource: protoCourse.settings?.dataSource,
    personas: protoCourse.personas || [],
    learningObjectives: protoCourse.learningObjectives || [],
    assessmentSettings: protoCourse.assessmentSettings ? {
      enableEmbeddedKnowledgeChecks: protoCourse.assessmentSettings.enableEmbeddedKnowledgeChecks,
      enableFinalExam: protoCourse.assessmentSettings.enableFinalExam,
    } : undefined,
    content: protoCourse.content ? {
      sections: protoCourse.content.sections || [],
      courseBlocks: protoCourse.content.courseBlocks || [],
    } : undefined,
    metadata: protoCourse.metadata,
  };
}

// Helper to convert frontend course to proto format
function frontendToProtoCourse(courseData: any): any {
  return {
    id: courseData.id,
    settings: {
      title: courseData.title || courseData.settings?.title || '',
      desiredOutcome: courseData.desiredOutcome || courseData.settings?.desiredOutcome || '',
      destinationFolder: courseData.destinationFolder || courseData.settings?.destinationFolder || '',
      categoryTags: courseData.categoryTags || courseData.settings?.categoryTags || [],
      dataSource: courseData.dataSource || courseData.settings?.dataSource || '',
    },
    personas: (courseData.personas || []).map((p: any) => ({
      id: p.id,
      name: p.name || '',
      role: p.role || '',
      kpis: p.kpis || '',
      responsibilities: p.responsibilities || '',
      challenges: p.challenges,
      concerns: p.concerns,
      knowledge: p.knowledge,
      learningObjectives: p.learningObjectives || [],
    })),
    learningObjectives: (courseData.learningObjectives || []).map((lo: any) => ({
      id: lo.id,
      text: lo.text || '',
    })),
    assessmentSettings: courseData.assessmentSettings ? {
      enableEmbeddedKnowledgeChecks: courseData.assessmentSettings.enableEmbeddedKnowledgeChecks ?? true,
      enableFinalExam: courseData.assessmentSettings.enableFinalExam ?? true,
    } : undefined,
    content: courseData.content ? {
      sections: (courseData.content.sections || courseData.sections || []).map((s: any) => ({
        id: s.id,
        name: s.name || '',
        lessons: (s.lessons || []).map((l: any) => ({
          id: l.id,
          title: l.title || '',
          content: l.content,
          blocks: (l.blocks || []).map((b: any) => ({
            id: b.id,
            type: b.type || 0,
            content: b.content || '',
            prompt: b.prompt,
            order: b.order || 0,
          })),
        })),
      })),
      courseBlocks: (courseData.content.courseBlocks || courseData.courseBlocks || []).map((b: any) => ({
        id: b.id,
        type: b.type || 0,
        content: b.content || '',
        prompt: b.prompt,
        order: b.order || 0,
      })),
    } : undefined,
  };
}

// Helper to convert protobuf Timestamp to ISO string
function timestampToISOString(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  // protobuf-es Timestamp has toDate() method
  if (typeof (ts as any).toDate === 'function') {
    return (ts as any).toDate().toISOString();
  }
  // Fallback for plain objects with seconds/nanos
  if (typeof ts === 'object' && 'seconds' in (ts as any)) {
    const seconds = Number((ts as any).seconds) || 0;
    return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

// Convert proto LibraryEntry to frontend format
function protoToFrontendLibraryEntry(entry: any): LibraryEntry {
  // Map CourseStatus enum to string
  // Proto enum values: UNSPECIFIED=0, DRAFT=1, PUBLISHED=2, GENERATED=3
  const statusMap: Record<number, 'draft' | 'published'> = {
    0: 'draft', // UNSPECIFIED -> draft
    1: 'draft', // DRAFT
    2: 'published', // PUBLISHED
    3: 'draft', // GENERATED -> draft
  };

  const statusValue = typeof entry.status === 'number' ? entry.status : 0;

  return {
    id: entry.id,
    title: entry.title || '',
    status: statusMap[statusValue] || 'draft',
    folder: entry.folder || '',
    tags: entry.tags || [],
    createdAt: timestampToISOString(entry.createdAt),
    modifiedAt: timestampToISOString(entry.modifiedAt),
    createdBy: entry.createdBy,
    thumbnailPath: entry.thumbnailPath,
  };
}

// Convert proto Folder to frontend FolderNode format
function protoToFrontendFolder(folder: any): FolderNode {
  // Map FolderType enum to string
  // Proto enum values: UNSPECIFIED=0, LIBRARY=1, TEAM=2, PERSONAL=3, FOLDER=4
  const typeMap: Record<number, 'library' | 'team' | 'personal' | 'folder'> = {
    0: 'folder', // UNSPECIFIED
    1: 'library', // LIBRARY
    2: 'team', // TEAM
    3: 'personal', // PERSONAL
    4: 'folder', // FOLDER
  };

  const typeValue = typeof folder.type === 'number' ? folder.type : 0;

  return {
    id: folder.id,
    name: folder.name || '',
    parentId: folder.parentId,
    type: typeMap[typeValue] || 'folder',
    children: folder.children?.map(protoToFrontendFolder),
    courseCount: folder.courseCount,
  };
}

// Async thunks for API operations using connect-rpc client
export const createNewCourse = createAsyncThunk(
  'course/createNew',
  async (courseData: Partial<Course>) => {
    const id = courseData.id || `course-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const protoData = frontendToProtoCourse({ ...courseData, id });
    const result = await courseClient.createCourse(protoData);
    return protoToFrontendCourse(result);
  }
);

export const saveCourse = createAsyncThunk(
  'course/save',
  async ({ id, courseData }: { id: string; courseData: Partial<Course> }) => {
    const protoData = frontendToProtoCourse(courseData);
    const result = await courseClient.updateCourse(id, protoData);
    return protoToFrontendCourse(result);
  }
);

export const loadCourse = createAsyncThunk(
  'course/load',
  async (courseId: string) => {
    const result = await courseClient.getCourse(courseId);
    return protoToFrontendCourse(result);
  }
);

export const loadCourseLibrary = createAsyncThunk(
  'course/loadLibrary',
  async (filters?: { status?: string; folder?: string }) => {
    // Note: status filter would need to be converted to CourseStatus enum if used
    const result = await courseClient.listCourses({
      folder: filters?.folder,
    });
    return result.map(protoToFrontendLibraryEntry);
  }
);

// Prefetch folders for content library
export const prefetchFolders = createAsyncThunk(
  'course/prefetchFolders',
  async (includeCourseCount: boolean = true) => {
    const result = await courseClient.getFolderHierarchy(includeCourseCount);
    return result.map(protoToFrontendFolder);
  }
);

// Prefetch courses for content library
export const prefetchCourses = createAsyncThunk(
  'course/prefetchCourses',
  async () => {
    const result = await courseClient.listCourses();
    return result.map(protoToFrontendLibraryEntry);
  }
);

export const deleteCourse = createAsyncThunk(
  'course/delete',
  async (courseId: string) => {
    await courseClient.deleteCourseById(courseId);
    return courseId;
  }
);

interface CourseState {
  currentCourse: Partial<Course>;
  courses: LibraryEntry[]; // Course listings from library (with tags, folder, etc.)
  folders: FolderNode[];
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
