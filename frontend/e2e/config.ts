/**
 * Central configuration for E2E tests.
 * All commonly used values should be defined here.
 */

// ===== Environment URLs =====
// Default to UAT environment for all tests
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mirai-uat.sogos.io';

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
// Enterprise SaaS SLA: no user-facing wait > 30s
export const TIMEOUTS = {
  /** Default page load timeout */
  pageLoad: 10000,
  /** AI generation steps — each must complete within 30s (enterprise SLA) */
  aiGeneration: 30000,
  /** Background job polling (legacy — non-wizard flows) */
  backgroundJob: 180000,
  /** Short wait for UI transitions */
  uiTransition: 2000,
  /** Element visibility check */
  elementVisible: 5000,
  /** Button to become enabled */
  buttonEnabled: 5000,
  /** Navigation after click (e.g. wizard → editor redirect) */
  navigation: 10000,
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
