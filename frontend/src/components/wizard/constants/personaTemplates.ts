/**
 * Pre-defined persona templates for both SME and Audience personas.
 * These are organized by category for easy browsing.
 */

import type { AudiencePersona, SMEPersona } from '@/gen/mirai/v1/course_wizard_pb';

// =============================================================================
// Audience Persona Templates
// =============================================================================

export interface AudienceTemplate extends Omit<AudiencePersona, '$typeName' | '$unknown'> {
  category: string;
}

export interface AudienceTemplateCategory {
  id: string;
  name: string;
  templates: AudienceTemplate[];
}

// Sales Personas
const salesAudienceTemplates: AudienceTemplate[] = [
  {
    id: 'template-sdr-bdr',
    name: 'SDR / BDR',
    role: 'Sales Development Representative',
    description: 'Entry-level sales role focused on outbound prospecting, qualifying leads, and setting meetings for account executives. Typically 0-2 years of experience.',
    goals: [
      'Learn effective prospecting techniques',
      'Master qualification frameworks (BANT, MEDDIC)',
      'Improve cold outreach response rates',
    ],
    category: 'Sales',
  },
  {
    id: 'template-account-exec',
    name: 'Account Executive',
    role: 'Account Executive',
    description: 'Mid-level sales role responsible for closing deals, managing the full sales cycle, and hitting quota. Typically 2-5+ years of experience.',
    goals: [
      'Improve deal closing rates',
      'Master negotiation and objection handling',
      'Build stronger customer relationships',
    ],
    category: 'Sales',
  },
  {
    id: 'template-csm',
    name: 'Customer Success Manager',
    role: 'Customer Success Manager',
    description: 'Post-sales role focused on customer retention, expansion, and ensuring customers achieve value from the product.',
    goals: [
      'Reduce customer churn',
      'Drive product adoption and engagement',
      'Identify upsell and expansion opportunities',
    ],
    category: 'Sales',
  },
];

// Product & Engineering Personas
const productEngineeringAudienceTemplates: AudienceTemplate[] = [
  {
    id: 'template-software-engineer',
    name: 'Software Engineer',
    role: 'Software Engineer',
    description: 'Developer responsible for building and maintaining software applications. May be frontend, backend, or full-stack focused.',
    goals: [
      'Learn new technologies and frameworks',
      'Write more maintainable and scalable code',
      'Improve debugging and problem-solving skills',
    ],
    category: 'Product & Engineering',
  },
  {
    id: 'template-product-manager',
    name: 'Product Manager',
    role: 'Product Manager',
    description: 'Cross-functional leader responsible for product strategy, roadmap, and working with engineering to deliver value to customers.',
    goals: [
      'Make better data-driven decisions',
      'Improve stakeholder communication',
      'Master prioritization frameworks',
    ],
    category: 'Product & Engineering',
  },
  {
    id: 'template-devops-sre',
    name: 'DevOps / SRE',
    role: 'DevOps Engineer / Site Reliability Engineer',
    description: 'Infrastructure and operations role focused on deployment automation, system reliability, and bridging development and operations.',
    goals: [
      'Improve deployment frequency and reliability',
      'Reduce incident response time',
      'Automate manual operational tasks',
    ],
    category: 'Product & Engineering',
  },
];

// Human Resources Personas
const hrAudienceTemplates: AudienceTemplate[] = [
  {
    id: 'template-hr-generalist',
    name: 'HR Generalist',
    role: 'HR Generalist',
    description: 'Broad HR role handling recruitment, employee relations, benefits, compliance, and various people operations tasks.',
    goals: [
      'Improve employee engagement and retention',
      'Stay current on employment law and compliance',
      'Develop more effective onboarding programs',
    ],
    category: 'Human Resources',
  },
];

// Security Personas
const securityAudienceTemplates: AudienceTemplate[] = [
  {
    id: 'template-security-analyst',
    name: 'Security Analyst',
    role: 'Security Analyst',
    description: 'Information security role focused on threat detection, vulnerability assessment, and protecting organizational assets.',
    goals: [
      'Identify and respond to security threats',
      'Improve security awareness across the organization',
      'Master security tools and frameworks',
    ],
    category: 'Security',
  },
];

export const audienceTemplateCategories: AudienceTemplateCategory[] = [
  { id: 'sales', name: 'Sales', templates: salesAudienceTemplates },
  { id: 'product-engineering', name: 'Product & Engineering', templates: productEngineeringAudienceTemplates },
  { id: 'hr', name: 'Human Resources', templates: hrAudienceTemplates },
  { id: 'security', name: 'Security', templates: securityAudienceTemplates },
];

// =============================================================================
// SME Persona Templates
// =============================================================================

export interface SMETemplate extends Omit<SMEPersona, '$typeName' | '$unknown'> {
  name: string; // Display name for template UI
  category: string;
}

export interface SMETemplateCategory {
  id: string;
  name: string;
  templates: SMETemplate[];
}

// Technical SMEs
const technicalSMETemplates: SMETemplate[] = [
  {
    id: 'sme-template-senior-engineer',
    name: 'Senior Software Engineer',
    jobTitle: 'Senior Software Engineer',
    description: 'Experienced developer with 8+ years building production systems. Deep expertise in software architecture, best practices, and mentoring junior developers.',
    voice: 'Technical but approachable. Uses real-world examples and avoids unnecessary jargon. Explains the "why" behind decisions.',
    skills: ['System Design', 'Code Review', 'Architecture', 'Mentoring'],
    category: 'Technical',
  },
  {
    id: 'sme-template-tech-lead',
    name: 'Technical Lead',
    jobTitle: 'Technical Lead / Staff Engineer',
    description: 'Technical leader responsible for guiding architecture decisions, setting technical direction, and ensuring engineering excellence across teams.',
    voice: 'Strategic and thoughtful. Balances technical depth with business context. Focuses on trade-offs and long-term implications.',
    skills: ['Technical Strategy', 'System Architecture', 'Team Leadership', 'Cross-functional Collaboration'],
    category: 'Technical',
  },
  {
    id: 'sme-template-solutions-architect',
    name: 'Solutions Architect',
    jobTitle: 'Solutions Architect',
    description: 'Expert in designing end-to-end technical solutions that meet business requirements. Bridges the gap between technical implementation and business needs.',
    voice: 'Clear and structured. Excels at breaking down complex systems into understandable components. Uses diagrams and visual explanations.',
    skills: ['Solution Design', 'Integration Patterns', 'Cloud Architecture', 'Requirements Analysis'],
    category: 'Technical',
  },
];

// Business SMEs
const businessSMETemplates: SMETemplate[] = [
  {
    id: 'sme-template-industry-expert',
    name: 'Industry Expert',
    jobTitle: 'Industry Consultant / Domain Expert',
    description: 'Deep subject matter expertise in a specific industry vertical. Understands market dynamics, regulations, and best practices.',
    voice: 'Authoritative but accessible. Shares industry insights and real case studies. Connects theory to practical applications.',
    skills: ['Industry Knowledge', 'Market Analysis', 'Best Practices', 'Regulatory Compliance'],
    category: 'Business',
  },
  {
    id: 'sme-template-business-analyst',
    name: 'Business Analyst',
    jobTitle: 'Senior Business Analyst',
    description: 'Expert in analyzing business processes, gathering requirements, and translating business needs into actionable specifications.',
    voice: 'Precise and methodical. Focuses on clarity and completeness. Uses structured frameworks and documentation.',
    skills: ['Requirements Gathering', 'Process Mapping', 'Data Analysis', 'Stakeholder Management'],
    category: 'Business',
  },
  {
    id: 'sme-template-project-manager',
    name: 'Project Manager',
    jobTitle: 'Senior Project Manager',
    description: 'Experienced in leading complex projects from initiation to delivery. Expert in methodologies, risk management, and team coordination.',
    voice: 'Organized and action-oriented. Emphasizes practical steps and clear outcomes. Focuses on execution and accountability.',
    skills: ['Project Planning', 'Risk Management', 'Agile/Scrum', 'Stakeholder Communication'],
    category: 'Business',
  },
];

// Training & Development SMEs
const trainingDevSMETemplates: SMETemplate[] = [
  {
    id: 'sme-template-instructional-designer',
    name: 'Instructional Designer',
    jobTitle: 'Senior Instructional Designer',
    description: 'Expert in creating effective learning experiences. Applies learning science principles to design engaging and impactful training content.',
    voice: 'Engaging and learner-focused. Breaks down concepts into digestible chunks. Uses varied instructional strategies.',
    skills: ['Learning Design', 'Adult Learning Theory', 'Assessment Design', 'Content Development'],
    category: 'Training & Development',
  },
  {
    id: 'sme-template-corporate-trainer',
    name: 'Corporate Trainer',
    jobTitle: 'Corporate Trainer / Facilitator',
    description: 'Skilled at delivering training programs and facilitating learning. Expert in engaging diverse audiences and driving behavior change.',
    voice: 'Energetic and encouraging. Uses stories and interactive elements. Checks for understanding frequently.',
    skills: ['Facilitation', 'Presentation Skills', 'Engagement Techniques', 'Performance Support'],
    category: 'Training & Development',
  },
];

// Leadership SMEs
const leadershipSMETemplates: SMETemplate[] = [
  {
    id: 'sme-template-executive-leader',
    name: 'Executive Leader',
    jobTitle: 'VP / Director',
    description: 'Senior leader with experience managing teams, driving strategy, and achieving business outcomes. Provides high-level perspective on organizational challenges.',
    voice: 'Strategic and visionary. Connects individual actions to broader goals. Inspires while being practical.',
    skills: ['Strategic Thinking', 'Team Leadership', 'Change Management', 'Executive Communication'],
    category: 'Leadership',
  },
  {
    id: 'sme-template-people-manager',
    name: 'People Manager',
    jobTitle: 'Engineering Manager / Team Lead',
    description: 'Experienced manager focused on developing people, building high-performing teams, and creating positive work environments.',
    voice: 'Supportive and growth-oriented. Shares management frameworks and personal experiences. Emphasizes empathy and communication.',
    skills: ['People Development', '1:1s & Feedback', 'Team Building', 'Performance Management'],
    category: 'Leadership',
  },
];

export const smeTemplateCategories: SMETemplateCategory[] = [
  { id: 'technical', name: 'Technical', templates: technicalSMETemplates },
  { id: 'business', name: 'Business', templates: businessSMETemplates },
  { id: 'training', name: 'Training & Development', templates: trainingDevSMETemplates },
  { id: 'leadership', name: 'Leadership', templates: leadershipSMETemplates },
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get all audience templates as a flat array
 */
export function getAllAudienceTemplates(): AudienceTemplate[] {
  return audienceTemplateCategories.flatMap((category) => category.templates);
}

/**
 * Get all SME templates as a flat array
 */
export function getAllSMETemplates(): SMETemplate[] {
  return smeTemplateCategories.flatMap((category) => category.templates);
}

/**
 * Convert an audience template to an AudiencePersona-compatible object
 */
export function audienceTemplateToPersona(template: AudienceTemplate): Omit<AudienceTemplate, 'category'> {
  const { category: _, ...persona } = template;
  return persona;
}

/**
 * Convert an SME template to an SMEPersona-compatible object
 */
export function smeTemplateToPersona(template: SMETemplate): Omit<SMETemplate, 'category' | 'name'> {
  const { category: _, name: __, ...persona } = template;
  return persona;
}

// Legacy exports for backwards compatibility
export type PersonaTemplate = AudienceTemplate;
export type PersonaTemplateCategory = AudienceTemplateCategory;
export const personaTemplateCategories = audienceTemplateCategories;
export const getAllPersonaTemplates = getAllAudienceTemplates;
export const getPersonaTemplateById = (id: string) => getAllAudienceTemplates().find((t) => t.id === id);
export const templateToPersona = audienceTemplateToPersona;
