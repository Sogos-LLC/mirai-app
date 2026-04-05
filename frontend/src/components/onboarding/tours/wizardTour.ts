import type { DriveStep } from 'driver.js';

export const wizardTourSteps: DriveStep[] = [
  {
    element: '[data-tour="wizard-stepper"]',
    popover: {
      title: 'Course Creation Wizard',
      description: 'Follow these 4 simple steps to create your course. Each step builds on the previous one.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="wizard-step-content"]',
    popover: {
      title: 'Step 1: Name Your Course',
      description: 'Start by entering what you want to teach. Keep it simple — the AI will help refine it.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="wizard-next-btn"]',
    popover: {
      title: 'Navigate Between Steps',
      description: 'Click Next to move forward. You can always go back to make changes.',
      side: 'top',
      align: 'center',
    },
  },
];
