/**
 * Pre-defined audience persona templates that users can quickly add to their course.
 * These are organized by category (Sales, Product, HR, Security).
 */

import type { AudiencePersona } from '@/gen/mirai/v1/course_wizard_pb';

export interface PersonaTemplate extends Omit<AudiencePersona, '$typeName' | '$unknown'> {
  category: string;
}

export interface PersonaTemplateCategory {
  id: string;
  name: string;
  templates: PersonaTemplate[];
}

// =============================================================================
// Sales Personas
// =============================================================================

const salesTemplates: PersonaTemplate[] = [
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

// =============================================================================
// Product & Engineering Personas
// =============================================================================

const productEngineeringTemplates: PersonaTemplate[] = [
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

// =============================================================================
// Human Resources Personas
// =============================================================================

const hrTemplates: PersonaTemplate[] = [
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

// =============================================================================
// Security Personas
// =============================================================================

const securityTemplates: PersonaTemplate[] = [
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

// =============================================================================
// Exported Categories
// =============================================================================

export const personaTemplateCategories: PersonaTemplateCategory[] = [
  {
    id: 'sales',
    name: 'Sales',
    templates: salesTemplates,
  },
  {
    id: 'product-engineering',
    name: 'Product & Engineering',
    templates: productEngineeringTemplates,
  },
  {
    id: 'hr',
    name: 'Human Resources',
    templates: hrTemplates,
  },
  {
    id: 'security',
    name: 'Security',
    templates: securityTemplates,
  },
];

/**
 * Get all templates as a flat array
 */
export function getAllPersonaTemplates(): PersonaTemplate[] {
  return personaTemplateCategories.flatMap((category) => category.templates);
}

/**
 * Get a template by ID
 */
export function getPersonaTemplateById(id: string): PersonaTemplate | undefined {
  return getAllPersonaTemplates().find((template) => template.id === id);
}

/**
 * Convert a template to an AudiencePersona-compatible object (without category)
 */
export function templateToPersona(template: PersonaTemplate): Omit<PersonaTemplate, 'category'> {
  const { category: _, ...persona } = template;
  return persona;
}
