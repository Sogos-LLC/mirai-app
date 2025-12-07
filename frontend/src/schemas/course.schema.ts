/**
 * Course Schemas
 *
 * Re-exports generated Zod schemas from protobuf definitions (Single Source of Truth)
 * and defines frontend-specific form schemas.
 */

import { z } from 'zod';

// ============================================================
// Re-export everything from generated schemas
// ============================================================

export * from '@/gen/mirai/v1/course_zod';

// Re-export enums for direct usage
export {
  CourseStatus,
  BlockType,
  FolderType,
  ExportFormat,
  ExportStatus,
} from '@/gen/mirai/v1/course_pb';

// ============================================================
// Form Schemas (Frontend-specific, derived from generated)
// ============================================================

import {
  CourseSettingsSchema,
  PersonaSchema,
  CourseSchema,
  FolderSchema,
  UpdateCourseRequestSchema,
} from '@/gen/mirai/v1/course_zod';
import { FolderType } from '@/gen/mirai/v1/course_pb';

/**
 * Course settings form - Step 1 of course builder
 * Extends CourseSettingsSchema with custom error messages
 */
export const courseSettingsFormSchema = CourseSettingsSchema.extend({
  title: z.string().min(1, 'Title is required').max(200),
  desiredOutcome: z.string().min(1, 'Learning goal is required'),
  destinationFolder: z.string().min(1, 'Folder is required'),
});

/**
 * Persona form - for adding/editing personas
 * Derives from PersonaSchema with custom error messages
 */
export const personaFormSchema = PersonaSchema.omit({ id: true, learningObjectives: true }).extend({
  name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
  kpis: z.string().min(1, 'KPIs are required'),
  responsibilities: z.string().min(1, 'Responsibilities are required'),
});

// ============================================================
// Frontend-specific Schemas (no proto equivalent)
// ============================================================

/**
 * Folder node - extended for UI with optional children
 */
export type FolderNode = {
  id: string;
  name: string;
  parentId?: string;
  type?: FolderType;
  children?: FolderNode[];
  courseCount?: number;
};

export const FolderNodeSchema: z.ZodType<FolderNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    parentId: z.string().optional(),
    type: z.nativeEnum(FolderType).optional(),
    children: z.array(FolderNodeSchema).optional(),
    courseCount: z.number().optional(),
  })
);

/**
 * Dashboard stats - frontend-specific aggregation
 */
export const DashboardStatsSchema = z.object({
  totalCourses: z.number(),
  recentCourses: z.array(CourseSchema),
  folders: z.array(FolderSchema),
});

/**
 * Course data for mutations (partial course for create/update)
 */
export const CourseDataSchema = UpdateCourseRequestSchema.partial();

/**
 * API response wrapper
 */
export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    error: z.string().optional(),
  });

// ============================================================
// Form Types
// ============================================================

export type CourseSettingsForm = z.infer<typeof courseSettingsFormSchema>;
export type PersonaForm = z.infer<typeof personaFormSchema>;
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
export type CourseData = z.infer<typeof CourseDataSchema>;
