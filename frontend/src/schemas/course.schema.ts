import { z } from 'zod';

// ============================================================
// Base Schemas
// ============================================================

/**
 * Learning objective - a specific goal for the course
 */
export const learningObjectiveSchema = z.object({
  id: z.string(),
  text: z.string(),
});

/**
 * Persona - represents a target learner
 */
export const personaSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
  kpis: z.string(),
  responsibilities: z.string(),
  challenges: z.string().optional(),
  concerns: z.string().optional(),
  knowledge: z.string().optional(),
  learningObjectives: z.array(learningObjectiveSchema).optional(),
});

/**
 * Block types supported in the course editor
 */
export const blockTypeSchema = z.enum(['heading', 'text', 'interactive', 'knowledgeCheck']);

/**
 * Block alignment - links block content to personas, objectives, and KPIs
 */
export const blockAlignmentSchema = z.object({
  personas: z.array(z.string()),
  learningObjectives: z.array(z.string()),
  kpis: z.array(z.string()),
});

/**
 * Course block - a unit of content in the course editor
 */
export const courseBlockSchema = z.object({
  id: z.string(),
  type: blockTypeSchema,
  content: z.string(),
  prompt: z.string().optional(),
  alignment: blockAlignmentSchema.optional(),
  order: z.number(),
});

/**
 * Lesson - a collection of blocks within a section
 */
export const lessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().optional(),
  blocks: z.array(courseBlockSchema).optional(),
});

/**
 * Course section - a grouping of lessons
 */
export const courseSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  lessons: z.array(lessonSchema),
});

/**
 * Assessment settings for the course
 */
export const courseAssessmentSettingsSchema = z.object({
  enableEmbeddedKnowledgeChecks: z.boolean(),
  enableFinalExam: z.boolean(),
});

/**
 * Course status
 */
export const courseStatusSchema = z.enum(['draft', 'published', 'generated']);

/**
 * Full course entity
 */
export const courseSchema = z.object({
  id: z.string(),
  title: z.string(),
  desiredOutcome: z.string(),
  destinationFolder: z.string(),
  categoryTags: z.array(z.string()),
  dataSource: z.string(),
  personas: z.array(personaSchema),
  learningObjectives: z.array(learningObjectiveSchema),
  sections: z.array(courseSectionSchema),
  assessmentSettings: courseAssessmentSettingsSchema.optional(),
  status: courseStatusSchema.optional(),
  content: z.object({
    sections: z.array(courseSectionSchema).optional(),
    courseBlocks: z.array(courseBlockSchema).optional(),
  }).optional(),
  createdAt: z.string(),
  modifiedAt: z.string(),
});

/**
 * Library entry - course listing for content library (subset of Course)
 * This is the single source of truth - replaces duplicates in courseSlice.ts and apiSlice.ts
 */
export const libraryEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'published']),
  folder: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  modifiedAt: z.string(),
  createdBy: z.string().optional(),
  thumbnailPath: z.string().optional(),
});

/**
 * Folder node - for folder hierarchy in content library
 * Matches proto Folder message
 */
export const folderNodeSchema: z.ZodType<FolderNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    parentId: z.string().optional(),
    type: z.enum(['library', 'team', 'personal', 'folder']).optional(),
    children: z.array(folderNodeSchema).optional(),
    courseCount: z.number().optional(),
  })
);

/**
 * Folder structure
 */
export interface Folder {
  id: string;
  name: string;
  children?: Folder[];
  courses?: Course[];
}

export const folderSchema: z.ZodType<Folder> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    children: z.array(folderSchema).optional(),
    courses: z.array(courseSchema).optional(),
  })
);

/**
 * Dashboard stats
 */
export const dashboardStatsSchema = z.object({
  totalCourses: z.number(),
  recentCourses: z.array(courseSchema),
  folders: z.array(folderSchema),
});

// ============================================================
// Form Schemas (for validation)
// ============================================================

/**
 * Course settings form - Step 1 of course builder
 */
export const courseSettingsFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  desiredOutcome: z.string().min(1, 'Learning goal is required'),
  destinationFolder: z.string().min(1, 'Folder is required'),
  categoryTags: z.array(z.string()),
  dataSource: z.string(),
});

/**
 * Persona form
 */
export const personaFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
  kpis: z.string().min(1, 'KPIs are required'),
  responsibilities: z.string().min(1, 'Responsibilities are required'),
  challenges: z.string().optional(),
  concerns: z.string().optional(),
  knowledge: z.string().optional(),
});

// ============================================================
// API Request/Response Schemas
// ============================================================

/**
 * Course data for mutations (partial course for create/update)
 */
export const courseDataSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  desiredOutcome: z.string().optional(),
  destinationFolder: z.string().optional(),
  categoryTags: z.array(z.string()).optional(),
  dataSource: z.string().optional(),
  personas: z.array(personaSchema).optional(),
  learningObjectives: z.array(learningObjectiveSchema).optional(),
  assessmentSettings: courseAssessmentSettingsSchema.optional(),
  content: z.any().optional(),
  status: courseStatusSchema.optional(),
  metadata: z.any().optional(),
  settings: z.any().optional(),
  sections: z.array(courseSectionSchema).optional(),
});

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
// Type Exports (derived from schemas)
// ============================================================

export type LearningObjective = z.infer<typeof learningObjectiveSchema>;
export type Persona = z.infer<typeof personaSchema>;
export type BlockType = z.infer<typeof blockTypeSchema>;
export type BlockAlignment = z.infer<typeof blockAlignmentSchema>;
export type CourseBlock = z.infer<typeof courseBlockSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type CourseSection = z.infer<typeof courseSectionSchema>;
export type CourseAssessmentSettings = z.infer<typeof courseAssessmentSettingsSchema>;
export type CourseStatus = z.infer<typeof courseStatusSchema>;
export type Course = z.infer<typeof courseSchema>;
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;
export type FolderNode = {
  id: string;
  name: string;
  parentId?: string;
  type?: 'library' | 'team' | 'personal' | 'folder';
  children?: FolderNode[];
  courseCount?: number;
};
// Folder type is exported as interface above (line 143)
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
export type CourseSettingsForm = z.infer<typeof courseSettingsFormSchema>;
export type PersonaForm = z.infer<typeof personaFormSchema>;
export type CourseData = z.infer<typeof courseDataSchema>;
