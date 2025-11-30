/**
 * Proto-Based Zod Validators
 *
 * These schemas validate form input using proto enums directly.
 * Proto types define the structure, Zod adds validation rules.
 *
 * All Plan fields use z.nativeEnum(Plan) to ensure proto enum values flow through.
 */

import { z } from 'zod';
import { Plan } from '@/gen/mirai/v1/common_pb';

// =============================================================================
// Plan Validation
// =============================================================================

/**
 * Validates any Plan enum value
 */
export const planSchema = z.nativeEnum(Plan);

/**
 * Validates checkout-eligible plans (excludes UNSPECIFIED and ENTERPRISE)
 */
export const checkoutPlanSchema = z.union([
  z.literal(Plan.STARTER),
  z.literal(Plan.PRO),
]);
export type CheckoutPlan = z.infer<typeof checkoutPlanSchema>;

// =============================================================================
// Registration Step Schemas
// =============================================================================

/**
 * Step 1: Email validation
 */
export const emailStepSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
});
export type EmailStepData = z.infer<typeof emailStepSchema>;

/**
 * Step 2: Organization info
 */
export const orgStepSchema = z.object({
  companyName: z
    .string()
    .min(1, 'Company name is required')
    .max(200, 'Company name must be less than 200 characters'),
  industry: z.string().optional(),
  teamSize: z.string().optional(),
});
export type OrgStepData = z.infer<typeof orgStepSchema>;

/**
 * Step 3: Account credentials
 */
export const accountStepSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type AccountStepData = z.infer<typeof accountStepSchema>;

/**
 * Step 4: Plan selection (uses proto enum)
 */
export const planStepSchema = z.object({
  plan: planSchema,
  seatCount: z.number().min(1, 'At least 1 seat is required').default(1),
});
export type PlanStepData = z.infer<typeof planStepSchema>;

// =============================================================================
// Complete Schemas
// =============================================================================

/**
 * Complete registration data
 */
export const registrationSchema = z.object({
  email: z.string().email(),
  companyName: z.string().min(1).max(200),
  industry: z.string().optional(),
  teamSize: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(8),
  plan: planSchema,
  seatCount: z.number().min(1),
});
export type RegistrationData = z.infer<typeof registrationSchema>;

/**
 * Enterprise contact form
 */
export const enterpriseContactSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  industry: z.string().optional(),
  teamSize: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  message: z.string().optional(),
});
export type EnterpriseContactData = z.infer<typeof enterpriseContactSchema>;
