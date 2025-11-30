/**
 * Zod Schemas
 *
 * Proto-based validators use z.nativeEnum(Plan) for proto enums.
 * Course schemas are non-proto and remain here.
 *
 * @see /src/lib/proto/validators.ts - Proto-aware validation schemas
 * @see /src/gen/mirai/v1/ - Generated proto types
 */

// Course schemas and types (non-proto)
export * from './course.schema';

// Proto-based validators from lib/proto
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
} from '@/lib/proto';
