/**
 * Proto Utilities
 *
 * Re-exports display converters and validators for convenient imports.
 * Import from '@/lib/proto' for all proto-related utilities.
 */

// Display converters for UI rendering
export {
  planToDisplayString,
  roleToDisplayString,
  teamRoleToDisplayString,
  subscriptionStatusToDisplayString,
} from './display';

// Zod validators using proto enums
export {
  // Plan schemas
  planSchema,
  checkoutPlanSchema,
  type CheckoutPlan,
  // Step schemas
  emailStepSchema,
  orgStepSchema,
  accountStepSchema,
  planStepSchema,
  type EmailStepData,
  type OrgStepData,
  type AccountStepData,
  type PlanStepData,
  // Complete schemas
  registrationSchema,
  enterpriseContactSchema,
  type RegistrationData,
  type EnterpriseContactData,
} from './validators';
