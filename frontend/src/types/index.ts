/**
 * Type Definitions
 *
 * Proto types (Plan, Role, User, etc.) are generated from Protocol Buffers.
 * Course types are derived from Zod schemas in /src/schemas/.
 *
 * @see /src/gen/mirai/v1/ - Generated API types from protos (SOURCE OF TRUTH)
 * @see /src/schemas/course.schema.ts - Course validation schemas
 */

// Proto types (generated) - THE source of truth
export { Plan, Role, TeamRole, SubscriptionStatus } from '@/gen/mirai/v1/common_pb';
export type { User, Company, Team, TeamMember } from '@/gen/mirai/v1/common_pb';

// Re-export course types from schemas
export type {
  Persona,
  LearningObjective,
  CourseSection,
  Lesson,
  BlockType,
  BlockAlignment,
  CourseBlock,
  CourseAssessmentSettings,
  Course,
  LibraryEntry,
  FolderNode,
  Folder,
  DashboardStats,
  CourseData,
} from '@/schemas';
