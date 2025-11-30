/**
 * Signup Wizard - XState-based registration flow
 *
 * Uses XState for state management and Zod + React Hook Form for validation.
 * Step components are in ./steps/ directory.
 */
export { SignupWizard } from './SignupWizard';

// Step components (for direct import if needed)
export { EmailStepV2 } from './steps/EmailStepV2';
export { OrgStepV2 } from './steps/OrgStepV2';
export { AccountStepV2 } from './steps/AccountStepV2';
export { PlanStepV2 } from './steps/PlanStepV2';
export { EnterpriseContactV2 } from './steps/EnterpriseContactV2';
export { SuccessStep } from './steps/SuccessStep';

// Hook
export { useRegistration } from './hooks/useRegistration';
