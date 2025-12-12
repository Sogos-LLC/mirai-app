/**
 * Central configuration for E2E tests.
 * All commonly used values should be defined here.
 */

// ===== Environment URLs =====
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mirai.sogos.io';
export const KRATOS_ADMIN_URL = process.env.KRATOS_ADMIN_URL || 'http://localhost:4434';

// ===== Test User =====
export const TEST_USER = {
  email: process.env.E2E_TEST_EMAIL || 'playwright-test@mirai.local',
  password: process.env.E2E_TEST_PASSWORD || 'PlaywrightTest123!',
  firstName: 'Playwright',
  lastName: 'Test',
} as const;

// ===== Paths =====
export const PATHS = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
  },
  dashboard: '/dashboard',
  contentLibrary: '/content-library',
  wizard: '/course/wizard',
  course: (id: string) => `/course/${id}`,
  courseEditor: (id: string) => `/course/${id}/editor`,
  courseOutline: (id: string) => `/course/${id}/outline`,
} as const;

// ===== Timeouts (in milliseconds) =====
export const TIMEOUTS = {
  /** Default page load timeout */
  pageLoad: 15000,
  /** AI generation steps (~7-20 seconds, use 25s for safety) */
  aiGeneration: 25000,
  /** Background job polling (outline generation) */
  backgroundJob: 180000,
  /** Short wait for UI transitions */
  uiTransition: 2000,
  /** Element visibility check */
  elementVisible: 10000,
  /** Button to become enabled */
  buttonEnabled: 30000,
} as const;

// ===== Polling Configuration =====
export const POLLING = {
  /** Default delay between poll attempts */
  delayMs: 6000,
  /** Maximum poll attempts for course creation */
  maxAttempts: 30,
} as const;

// ===== Screenshot Directories =====
export const SCREENSHOTS = {
  dir: 'playwright/screenshots',
  authPrefix: 'setup',
  wizardPrefix: 'wizard',
  editorPrefix: 'editor',
  imageGenPrefix: 'img-gen',
} as const;

// ===== Auth State =====
export const AUTH = {
  stateFile: './e2e/.auth/user.json',
} as const;

// ===== Test Data =====
export const TEST_DATA = {
  wizard: {
    courseName: 'E2E Test Course - Image Generation',
    additionalContext: 'This is a test course for E2E Playwright testing. Focus on practical examples with image components.',
  },
  imageGeneration: {
    prompt: 'A professional diagram showing the software development lifecycle',
    /** Course ID with completed lesson content (for image generation tests) */
    courseWithLessons: 'b68895fc-a069-4c41-812e-a6a7438bb60f',
  },
} as const;

// ===== Selectors (common patterns) =====
export const SELECTORS = {
  /** Course links in content library */
  courseLink: 'a[href*="/course/"]',
  /** Image component placeholder in editor */
  imageComponent: '[data-component-type="image"], [class*="image-placeholder"]',
  /** Generate button patterns */
  generateButton: /generate|create/i,
  /** Next/Continue button patterns */
  nextButton: /next|continue/i,
} as const;
