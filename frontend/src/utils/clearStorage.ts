import * as courseClient from '@/lib/courseClient';

// Utility to clear corrupted localStorage data
export const clearCorruptedStorage = () => {
  if (typeof window !== 'undefined') {
    try {
      // Get current state
      const currentState = localStorage.getItem('currentCourseState');
      if (currentState) {
        const parsed = JSON.parse(currentState);

        // Check if the course has a problematic ID
        if (parsed.currentCourse?.id?.includes('54b887a6-330c-4829-9cf2-dd1f883d5a3b')) {
          console.log('Clearing corrupted course data from localStorage');
          localStorage.removeItem('currentCourseState');
          return true;
        }
      }
    } catch (error) {
      console.error('Error clearing storage:', error);
      // If there's an error parsing, just clear it
      localStorage.removeItem('currentCourseState');
      return true;
    }
  }
  return false;
};

// Function to validate course exists on server
export const validateCourseExists = async (courseId: string): Promise<boolean> => {
  try {
    const course = await courseClient.getCourse(courseId);
    return !!course;
  } catch {
    return false;
  }
};
