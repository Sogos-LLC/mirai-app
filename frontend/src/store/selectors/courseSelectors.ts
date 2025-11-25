import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '@/store';

// Base selectors - these only re-run if their specific slice of state changes
export const selectCourseState = (state: RootState) => state.course;
export const selectCurrentCourse = (state: RootState) => state.course.currentCourse;
export const selectCourseBlocks = (state: RootState) => state.course.courseBlocks;
export const selectCurrentStep = (state: RootState) => state.course.currentStep;

// Individual field selectors - only re-render components when specific fields change
export const selectCourseId = createSelector(
  [selectCurrentCourse],
  (course) => course.id || ''
);

export const selectCourseTitle = createSelector(
  [selectCurrentCourse],
  (course) => course.title || ''
);

export const selectCourseOutcome = createSelector(
  [selectCurrentCourse],
  (course) => course.desiredOutcome || ''
);

export const selectCourseFolder = createSelector(
  [selectCurrentCourse],
  (course) => course.destinationFolder || ''
);

export const selectCourseTags = createSelector(
  [selectCurrentCourse],
  (course) => course.categoryTags || []
);

export const selectCourseDataSource = createSelector(
  [selectCurrentCourse],
  (course) => course.dataSource || ''
);

export const selectCoursePersonas = createSelector(
  [selectCurrentCourse],
  (course) => course.personas || []
);

export const selectLearningObjectives = createSelector(
  [selectCurrentCourse],
  (course) => course.learningObjectives || []
);

export const selectAssessmentSettings = createSelector(
  [selectCurrentCourse],
  (course) => course.assessmentSettings || {
    enableEmbeddedKnowledgeChecks: true,
    enableFinalExam: true,
  }
);

// Computed selectors
export const selectPersonaCount = createSelector(
  [selectCoursePersonas],
  (personas) => personas.length
);

export const selectObjectiveCount = createSelector(
  [selectLearningObjectives],
  (objectives) => objectives.length
);

export const selectIsValidCourse = createSelector(
  [selectCourseTitle, selectCourseOutcome, selectCoursePersonas],
  (title, outcome, personas) => {
    return !!(title && outcome && personas.length > 0);
  }
);

// Persona-specific selectors
export const selectPersonaById = (personaId: string) =>
  createSelector([selectCoursePersonas], (personas) =>
    personas.find((p) => p.id === personaId)
  );

// Block-specific selectors
export const selectBlockById = (blockId: string) =>
  createSelector([selectCourseBlocks], (blocks) =>
    blocks.find((b) => b.id === blockId)
  );

export const selectActiveBlock = createSelector(
  [selectCourseBlocks, (state: RootState) => state.course.activeBlockId],
  (blocks, activeId) => (activeId ? blocks.find((b) => b.id === activeId) : null)
);

// Status selectors
export const selectIsLoading = (state: RootState) => state.course.isLoading;
export const selectIsSaving = (state: RootState) => state.course.isSaving;
export const selectError = (state: RootState) => state.course.error;

// Course library selectors
export const selectCourses = (state: RootState) => state.course.courses;

export const selectDraftCourses = createSelector([selectCourses], (courses) =>
  courses.filter((c) => c.status === 'draft')
);

export const selectPublishedCourses = createSelector([selectCourses], (courses) =>
  courses.filter((c) => c.status === 'published')
);

export const selectRecentCourses = createSelector([selectCourses], (courses) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return courses
    .filter((c) => new Date(c.modifiedAt || c.createdAt) > sevenDaysAgo)
    .sort(
      (a, b) =>
        new Date(b.modifiedAt || b.createdAt).getTime() -
        new Date(a.modifiedAt || a.createdAt).getTime()
    );
});