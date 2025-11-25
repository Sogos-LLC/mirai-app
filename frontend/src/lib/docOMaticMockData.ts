import { Course, Persona, LearningObjective, CourseBlock, CourseSection } from '@/types';

// Mock data for Doc-O-Matic sales training scenario
export const docOMaticPersonas: Persona[] = [
  {
    id: 'persona-1',
    name: 'Sales Representative',
    role: 'Sales Rep',
    kpis: 'Monthly quota attainment, number of demos scheduled, conversion rate from demo to trial, average deal size',
    responsibilities: 'Prospecting new leads, conducting product demonstrations, managing sales pipeline, closing deals',
    challenges: 'Understanding complex document workflows, competing against established players, articulating ROI',
    concerns: 'Meeting quarterly targets, handling technical objections, building trust with enterprise buyers',
    knowledge: 'Basic understanding of SaaS, CRM proficiency, general sales methodology',
  },
  {
    id: 'persona-2',
    name: 'Sales Manager',
    role: 'Sales Manager',
    kpis: 'Team quota achievement, forecast accuracy, rep ramp time, pipeline health metrics',
    responsibilities: 'Coaching sales team, pipeline review, forecast management, strategic account planning',
    challenges: 'Ensuring consistent messaging across team, identifying coaching opportunities, resource allocation',
    concerns: 'Team performance visibility, sales process adherence, competitive positioning',
    knowledge: 'Sales management experience, understanding of sales metrics, coaching methodologies',
  },
  {
    id: 'persona-3',
    name: 'Solution Engineer',
    role: 'Solution Engineer',
    kpis: 'Demo-to-trial conversion, technical win rate, time to value for POCs, customer satisfaction scores',
    responsibilities: 'Technical demonstrations, POC management, integration consulting, technical objection handling',
    challenges: 'Explaining complex integrations simply, customizing demos for different industries, managing POC scope',
    concerns: 'Technical feasibility questions, integration requirements, security and compliance needs',
    knowledge: 'API knowledge, document management systems, enterprise software architecture, basic coding',
  },
];

export const docOMaticLearningObjectives: LearningObjective[] = [
  {
    id: 'obj-1',
    text: 'Articulate Doc-O-Matic\'s unique value proposition and differentiate from competitors like DocuSign and Adobe Sign',
  },
  {
    id: 'obj-2',
    text: 'Conduct effective discovery to identify document automation pain points and quantify business impact',
  },
  {
    id: 'obj-3',
    text: 'Demonstrate core Doc-O-Matic features aligned to specific customer use cases and industry requirements',
  },
  {
    id: 'obj-4',
    text: 'Handle common objections around pricing, security, and implementation complexity with confidence',
  },
  {
    id: 'obj-5',
    text: 'Build a compelling business case showing ROI and time savings from document automation',
  },
];

export const docOMaticCourseBlocks: CourseBlock[] = [
  // Section 1: Introduction
  {
    id: 'block-1',
    type: 'heading',
    content: 'Welcome to Doc-O-Matic Sales Mastery',
    order: 0,
    alignment: {
      personas: ['persona-1', 'persona-2', 'persona-3'],
      learningObjectives: [],
      kpis: [],
    },
  },
  {
    id: 'block-2',
    type: 'text',
    content: 'In this course, you\'ll learn how to effectively sell Doc-O-Matic\'s document automation platform to enterprise clients. Doc-O-Matic helps companies eliminate manual document processes, reduce errors by 90%, and accelerate document turnaround time by 75%. By the end of this training, you\'ll be equipped to identify opportunities, conduct compelling demonstrations, and close deals with confidence.',
    order: 1,
    alignment: {
      personas: ['persona-1', 'persona-2'],
      learningObjectives: ['obj-1'],
      kpis: [],
    },
  },
  {
    id: 'block-3',
    type: 'interactive',
    content: 'Quick Assessment: What\'s your current experience level with document automation solutions?',
    prompt: 'Interactive quiz to gauge baseline knowledge',
    order: 2,
    alignment: {
      personas: ['persona-1'],
      learningObjectives: [],
      kpis: [],
    },
  },
  // Section 2: Product Knowledge
  {
    id: 'block-4',
    type: 'heading',
    content: 'Understanding Doc-O-Matic\'s Core Capabilities',
    order: 3,
    alignment: {
      personas: ['persona-1', 'persona-3'],
      learningObjectives: ['obj-3'],
      kpis: [],
    },
  },
  {
    id: 'block-5',
    type: 'text',
    content: `Doc-O-Matic's platform consists of five core modules:

1. **Template Designer**: Drag-and-drop interface for creating dynamic document templates
2. **Workflow Automation**: Visual workflow builder for multi-step approval processes
3. **Data Integration Hub**: Pre-built connectors to 50+ enterprise systems
4. **E-Signature Engine**: Legally binding electronic signatures with audit trails
5. **Analytics Dashboard**: Real-time insights into document processing metrics

Each module addresses specific pain points in the document lifecycle, from creation to archival.`,
    order: 4,
    alignment: {
      personas: ['persona-1', 'persona-3'],
      learningObjectives: ['obj-3'],
      kpis: ['conversion rate from demo to trial'],
    },
  },
  {
    id: 'block-6',
    type: 'knowledgeCheck',
    content: JSON.stringify({
      question: 'Which Doc-O-Matic module would best help a client who says "We spend hours copying data from our CRM into contracts"?',
      options: [
        'Template Designer - for creating document templates',
        'Data Integration Hub - for connecting to enterprise systems',
        'E-Signature Engine - for getting documents signed',
        'Analytics Dashboard - for tracking metrics'
      ],
      correctAnswer: 1,
      explanation: 'The Data Integration Hub provides pre-built connectors to 50+ enterprise systems including CRMs, allowing automatic data population in documents.'
    }),
    prompt: 'Knowledge check on matching solutions to client needs',
    order: 5,
    alignment: {
      personas: ['persona-1'],
      learningObjectives: ['obj-3'],
      kpis: [],
    },
  },
  // Section 3: Discovery Techniques
  {
    id: 'block-7',
    type: 'heading',
    content: 'Mastering Discovery Conversations',
    order: 6,
    alignment: {
      personas: ['persona-1', 'persona-2'],
      learningObjectives: ['obj-2'],
      kpis: ['number of demos scheduled'],
    },
  },
  {
    id: 'block-8',
    type: 'text',
    content: `Effective discovery is crucial for Doc-O-Matic sales success. Use the IMPACT framework:

**I** - Identify current document processes
**M** - Measure time and cost of manual tasks
**P** - Pain points and frustrations
**A** - Authority and decision-making process
**C** - Criteria for success
**T** - Timeline and urgency

Key discovery questions:
• "How many documents does your team process monthly?"
• "What percentage require multiple approvals?"
• "How much time do errors and rework consume?"
• "What's the business impact of document delays?"`,
    order: 7,
    alignment: {
      personas: ['persona-1'],
      learningObjectives: ['obj-2'],
      kpis: ['conversion rate from demo to trial'],
    },
  },
  // Section 4: Competitive Differentiation
  {
    id: 'block-9',
    type: 'heading',
    content: 'Positioning Against Competitors',
    order: 8,
    alignment: {
      personas: ['persona-1', 'persona-2'],
      learningObjectives: ['obj-1'],
      kpis: [],
    },
  },
  {
    id: 'block-10',
    type: 'text',
    content: `Doc-O-Matic's key differentiators:

**vs. DocuSign**: Beyond just signatures - full document lifecycle automation
**vs. Adobe Sign**: 60% lower total cost of ownership with superior workflow capabilities
**vs. Legacy DMS**: Cloud-native architecture with no infrastructure requirements

Unique selling points:
• No-code template designer (competitors require technical resources)
• Industry-specific pre-built templates (500+ templates across 12 industries)
• Unlimited users at flat pricing (vs. per-user pricing models)
• 24/7 implementation support included in all plans`,
    order: 9,
    alignment: {
      personas: ['persona-1', 'persona-2'],
      learningObjectives: ['obj-1'],
      kpis: ['average deal size'],
    },
  },
  // Section 5: Objection Handling
  {
    id: 'block-11',
    type: 'heading',
    content: 'Handling Common Objections',
    order: 10,
    alignment: {
      personas: ['persona-1', 'persona-3'],
      learningObjectives: ['obj-4'],
      kpis: [],
    },
  },
  {
    id: 'block-12',
    type: 'interactive',
    content: 'Role-play scenario: Customer says "We already have DocuSign, why do we need Doc-O-Matic?"',
    prompt: 'Interactive objection handling practice',
    order: 11,
    alignment: {
      personas: ['persona-1'],
      learningObjectives: ['obj-4'],
      kpis: ['technical win rate'],
    },
  },
  // Section 6: ROI and Business Case
  {
    id: 'block-13',
    type: 'heading',
    content: 'Building the Business Case',
    order: 12,
    alignment: {
      personas: ['persona-1', 'persona-2'],
      learningObjectives: ['obj-5'],
      kpis: ['average deal size'],
    },
  },
  {
    id: 'block-14',
    type: 'text',
    content: `Doc-O-Matic ROI Calculator inputs:
• Number of documents processed monthly
• Average time per document (creation + routing + approval)
• Error rate and rework percentage
• Average hourly cost of document processors
• Compliance risk and audit costs

Typical results:
• 75% reduction in document processing time
• 90% reduction in errors
• 50% reduction in compliance audit time
• ROI achieved in 3-4 months
• 3-year savings of $500K-$2M for mid-market companies`,
    order: 13,
    alignment: {
      personas: ['persona-1'],
      learningObjectives: ['obj-5'],
      kpis: ['average deal size', 'Monthly quota attainment'],
    },
  },
  {
    id: 'block-15',
    type: 'knowledgeCheck',
    content: JSON.stringify({
      question: 'A prospect processes 10,000 documents monthly, taking 15 minutes each. With Doc-O-Matic reducing time by 75%, what is the monthly time savings?',
      options: [
        '625 hours saved per month',
        '1,250 hours saved per month',
        '1,875 hours saved per month',
        '2,500 hours saved per month'
      ],
      correctAnswer: 2,
      explanation: 'Current time: 10,000 docs × 15 min = 150,000 min = 2,500 hours. With 75% reduction = 1,875 hours saved monthly. At $50/hour, that\'s $93,750 in monthly savings!'
    }),
    prompt: 'Knowledge check on ROI calculation',
    order: 14,
    alignment: {
      personas: ['persona-1'],
      learningObjectives: ['obj-5'],
      kpis: [],
    },
  },
];

// Final exam questions
export const docOMaticFinalExam = {
  title: 'Doc-O-Matic Sales Mastery Final Exam',
  passingScore: 80,
  questions: [
    {
      id: 'exam-q1',
      question: 'What is Doc-O-Matic\'s primary differentiator compared to DocuSign?',
      options: [
        'Lower pricing',
        'Better e-signature technology',
        'Full document lifecycle automation beyond signatures',
        'More integration options'
      ],
      correctAnswer: 2
    },
    {
      id: 'exam-q2',
      question: 'According to the IMPACT discovery framework, what does the "M" stand for?',
      options: [
        'Management approval process',
        'Measure time and cost of manual tasks',
        'Monthly document volume',
        'Migration requirements'
      ],
      correctAnswer: 1
    },
    {
      id: 'exam-q3',
      question: 'What is the typical ROI timeline for Doc-O-Matic implementations?',
      options: [
        '1-2 months',
        '3-4 months',
        '6-9 months',
        '12+ months'
      ],
      correctAnswer: 1
    },
    {
      id: 'exam-q4',
      question: 'Which Doc-O-Matic module includes pre-built connectors to enterprise systems?',
      options: [
        'Template Designer',
        'Workflow Automation',
        'Data Integration Hub',
        'Analytics Dashboard'
      ],
      correctAnswer: 2
    },
    {
      id: 'exam-q5',
      question: 'What percentage reduction in errors do customers typically see with Doc-O-Matic?',
      options: [
        '50%',
        '75%',
        '90%',
        '95%'
      ],
      correctAnswer: 2
    }
  ]
};

export const docOMaticCourseSections: CourseSection[] = [
  {
    id: 'section-1',
    name: 'Introduction to Doc-O-Matic',
    lessons: [
      {
        id: 'lesson-1-1',
        title: 'Welcome and Course Overview',
        blocks: docOMaticCourseBlocks.filter(b => b.order >= 0 && b.order <= 2),
      },
    ],
  },
  {
    id: 'section-2',
    name: 'Product Mastery',
    lessons: [
      {
        id: 'lesson-2-1',
        title: 'Core Capabilities and Features',
        blocks: docOMaticCourseBlocks.filter(b => b.order >= 3 && b.order <= 5),
      },
      {
        id: 'lesson-2-2',
        title: 'Competitive Positioning',
        blocks: docOMaticCourseBlocks.filter(b => b.order >= 8 && b.order <= 9),
      },
    ],
  },
  {
    id: 'section-3',
    name: 'Sales Methodology',
    lessons: [
      {
        id: 'lesson-3-1',
        title: 'Discovery and Qualification',
        blocks: docOMaticCourseBlocks.filter(b => b.order >= 6 && b.order <= 7),
      },
      {
        id: 'lesson-3-2',
        title: 'Objection Handling',
        blocks: docOMaticCourseBlocks.filter(b => b.order >= 10 && b.order <= 11),
      },
      {
        id: 'lesson-3-3',
        title: 'Building the Business Case',
        blocks: docOMaticCourseBlocks.filter(b => b.order >= 12 && b.order <= 14),
      },
    ],
  },
  {
    id: 'section-4',
    name: 'Final Assessment',
    lessons: [
      {
        id: 'lesson-4-1',
        title: 'Course Final Exam',
        blocks: [], // Final exam will be handled separately in the UI
      },
    ],
  },
];

export const docOMaticCourse: Course = {
  id: 'course-1',
  title: 'Selling Doc-O-Matic to Enterprise Clients',
  desiredOutcome: 'Enable sales team to effectively position, demonstrate, and sell Doc-O-Matic\'s document automation platform to enterprise clients, achieving 30% higher close rates and 25% larger average deal sizes',
  destinationFolder: 'Sales Enablement',
  categoryTags: ['Sales', 'Product Training', 'Enterprise', 'SaaS', 'Required'],
  dataSource: 'Curated Web Sources',
  personas: docOMaticPersonas,
  learningObjectives: docOMaticLearningObjectives,
  sections: docOMaticCourseSections,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
};

// AI Generation mock responses
export const aiGeneratedContent = {
  learningObjectives: [
    'Articulate Doc-O-Matic\'s unique value proposition and differentiate from competitors',
    'Conduct effective discovery to identify document automation pain points',
    'Demonstrate core features aligned to customer use cases',
    'Handle common objections with confidence',
    'Build compelling ROI-based business cases',
  ],

  personaDetails: {
    'Sales Rep': {
      challenges: 'Understanding complex document workflows, competing against established players, articulating ROI to technical and business stakeholders',
      concerns: 'Meeting quarterly targets, handling technical objections, building trust with enterprise buyers who have existing solutions',
      knowledge: 'Basic understanding of SaaS sales cycles, CRM proficiency, general sales methodology, familiarity with document management concepts',
    },
    'Sales Manager': {
      challenges: 'Ensuring consistent messaging across team, identifying coaching opportunities, resource allocation, forecast accuracy',
      concerns: 'Team performance visibility, sales process adherence, competitive positioning, deal velocity and pipeline health',
      knowledge: 'Sales management experience, understanding of sales metrics, coaching methodologies, strategic account planning',
    },
  },

  courseIntroduction: 'Welcome to Doc-O-Matic Sales Mastery! This comprehensive training program will transform you into a Doc-O-Matic expert, capable of identifying opportunities, conducting powerful demonstrations, and closing enterprise deals with confidence.',

  blockSuggestions: [
    'Add an interactive scenario about handling pricing objections',
    'Include a video demonstration of the Template Designer',
    'Create a comparison matrix against top 3 competitors',
    'Add customer success stories from similar industries',
    'Include a quiz on key product differentiators',
  ],
};

// Mock generation delays (in milliseconds)
export const mockGenerationDelays = {
  learningObjectives: 2000,
  personas: 2500,
  courseContent: 4000,
  blocks: 1500,
};

// Sample customer stories for the course
export const docOMaticCustomerStories = [
  {
    company: 'TechCorp Industries',
    industry: 'Manufacturing',
    challenge: 'Processing 50,000 purchase orders monthly with 15% error rate',
    solution: 'Implemented Doc-O-Matic workflow automation',
    results: '92% reduction in errors, 60% faster processing, $2M annual savings',
  },
  {
    company: 'Global Finance Ltd',
    industry: 'Financial Services',
    challenge: 'Manual loan document processing taking 5-7 days',
    solution: 'Doc-O-Matic templates and e-signature integration',
    results: 'Same-day loan processing, 80% reduction in dropoffs, 3x volume capacity',
  },
  {
    company: 'HealthFirst Medical',
    industry: 'Healthcare',
    challenge: 'HIPAA compliance risks with paper-based patient forms',
    solution: 'Secure digital forms with Doc-O-Matic',
    results: '100% HIPAA compliance, 70% reduction in patient wait times',
  },
];