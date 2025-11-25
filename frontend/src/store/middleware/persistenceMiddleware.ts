import { Middleware } from '@reduxjs/toolkit';
import { saveCourse } from '../slices/courseSlice';
import { debounce } from 'lodash';

// Track if we're currently creating a course to prevent saves during creation
let isCreatingCourse = false;

// Debounced save function to avoid too many API calls
const debouncedSave = debounce(
  (dispatch: any, courseId: string, courseData: any) => {
    // Don't save if we're in the middle of creating a course
    if (courseId && !isCreatingCourse) {
      dispatch(saveCourse({ id: courseId, courseData }));
    }
  },
  500 // Wait 500ms after the last change before saving
);

export const persistenceMiddleware: Middleware = (storeAPI) => (next) => (action: any) => {
  // Track course creation state
  if (action.type === 'course/createNewCourse/pending') {
    isCreatingCourse = true;
    debouncedSave.cancel(); // Cancel any pending saves
  } else if (
    action.type === 'course/createNewCourse/fulfilled' ||
    action.type === 'course/createNewCourse/rejected'
  ) {
    isCreatingCourse = false;
  }

  const result = next(action);
  const state = storeAPI.getState();

  // List of actions that should trigger auto-save
  const autoSaveActions = [
    'course/setCourseField',
    'course/addPersona',
    'course/updatePersona',
    'course/removePersona',
    'course/setLearningObjectives',
    'course/setAssessmentSettings',
    'course/addCourseBlock',
    'course/updateCourseBlock',
    'course/removeCourseBlock',
    'course/reorderCourseBlocks',
  ];

  // Check if this action should trigger auto-save
  if (autoSaveActions.includes(action.type) && !isCreatingCourse) {
    const { currentCourse, courseBlocks, isSaving } = state.course;

    // Only save if we have a course ID and we're not already saving
    if (currentCourse?.id && !isSaving) {
      const courseDataToSave = {
        ...currentCourse,
        content: {
          sections: currentCourse.sections || [],
          courseBlocks: courseBlocks || [],
        },
        settings: {
          title: currentCourse.title || '',
          desiredOutcome: currentCourse.desiredOutcome || '',
          destinationFolder: currentCourse.destinationFolder || '',
          categoryTags: currentCourse.categoryTags || [],
          dataSource: currentCourse.dataSource || 'open-web',
        },
      };

      // Use debounced save to avoid excessive API calls
      debouncedSave(storeAPI.dispatch, currentCourse.id, courseDataToSave);
    }
  }

  // Also save to localStorage for recovery on page refresh
  // But skip during course creation and certain actions that shouldn't persist
  const skipLocalStorageActions = [
    'course/createNewCourse/pending',
    'course/createNewCourse/fulfilled',
    'course/createNewCourse/rejected',
    'course/loadCourse/pending',
    'course/loadCourse/fulfilled',
    'course/loadCourse/rejected',
  ];

  if (
    action.type.startsWith('course/') &&
    !skipLocalStorageActions.includes(action.type) &&
    !isCreatingCourse &&
    typeof window !== 'undefined'
  ) {
    try {
      const courseState = state.course;
      // Only save if we have a valid course with an ID
      if (courseState.currentCourse?.id) {
        localStorage.setItem('currentCourseState', JSON.stringify({
          currentCourse: courseState.currentCourse,
          courseBlocks: courseState.courseBlocks,
          currentStep: courseState.currentStep,
          timestamp: Date.now(), // Add timestamp for debugging
        }));
      }
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }

  return result;
};

// Function to restore state from localStorage on app initialization
export const restoreFromLocalStorage = () => {
  // Check if we're in the browser
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const savedState = localStorage.getItem('currentCourseState');
    if (savedState) {
      const parsed = JSON.parse(savedState);

      // Don't restore if there's no course ID
      if (!parsed.currentCourse?.id) {
        localStorage.removeItem('currentCourseState');
        return null;
      }

      // Check if the saved state is too old (more than 24 hours)
      if (parsed.timestamp) {
        const ageInHours = (Date.now() - parsed.timestamp) / (1000 * 60 * 60);
        if (ageInHours > 24) {
          console.log('Clearing stale course state from localStorage');
          localStorage.removeItem('currentCourseState');
          return null;
        }
      }

      // Validate that the course has required fields
      const requiredFields = ['id'];
      const hasRequiredFields = requiredFields.every(
        field => parsed.currentCourse?.[field]
      );

      if (!hasRequiredFields) {
        console.log('Invalid course state in localStorage, clearing');
        localStorage.removeItem('currentCourseState');
        return null;
      }

      // Clear specific corrupted course IDs
      const corruptedIds = ['course-54b887a6-330c-4829-9cf2-dd1f883d5a3b'];
      if (corruptedIds.some(id => parsed.currentCourse?.id?.includes(id))) {
        console.log('Skipping restoration of corrupted course');
        localStorage.removeItem('currentCourseState');
        return null;
      }

      return parsed;
    }
  } catch (error) {
    console.error('Failed to restore from localStorage:', error);
    // Clear corrupted data
    localStorage.removeItem('currentCourseState');
  }
  return null;
};