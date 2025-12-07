// Mock API handlers for Playwright tests
// Add custom mock handlers here as needed

export const mockHandlers = {
  // Example: Mock successful course creation
  mockCreateCourse: async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        course: {
          id: 'new-course-id',
          title: 'New Course',
          status: 'COURSE_STATUS_DRAFT',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  },

  // Example: Mock course list
  mockCourseList: async (route: any, courses: any[] = []) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        courses,
        totalCount: courses.length,
      }),
    });
  },
};
