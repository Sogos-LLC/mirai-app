export interface Persona {
  id: string;
  name: string;
  role: string;
  kpis: string;
  responsibilities: string;
  challenges?: string;
  concerns?: string;
  knowledge?: string;
  learningObjectives?: LearningObjective[];
}

export interface LearningObjective {
  id: string;
  text: string;
}

export interface CourseSection {
  id: string;
  name: string;
  lessons: Lesson[];
}

export interface Lesson {
  id: string;
  title: string;
  content?: string;
  blocks?: CourseBlock[];
}

export type BlockType = 'heading' | 'text' | 'interactive' | 'knowledgeCheck';

export interface BlockAlignment {
  personas: string[];
  learningObjectives: string[];
  kpis: string[];
}

export interface CourseBlock {
  id: string;
  type: BlockType;
  content: string;
  prompt?: string;
  alignment?: BlockAlignment;
  order: number;
}

export interface CourseAssessmentSettings {
  enableEmbeddedKnowledgeChecks: boolean;
  enableFinalExam: boolean;
}

export interface Course {
  id: string;
  title: string;
  desiredOutcome: string;
  destinationFolder: string;
  categoryTags: string[];
  dataSource: string;
  personas: Persona[];
  learningObjectives: LearningObjective[];
  sections: CourseSection[];
  assessmentSettings?: CourseAssessmentSettings;
  status?: 'draft' | 'published' | 'generated';
  content?: {
    sections?: CourseSection[];
    courseBlocks?: CourseBlock[];
  };
  createdAt: string;
  modifiedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  children?: Folder[];
  courses?: Course[];
}

export interface DashboardStats {
  totalCourses: number;
  recentCourses: Course[];
  folders: Folder[];
}
