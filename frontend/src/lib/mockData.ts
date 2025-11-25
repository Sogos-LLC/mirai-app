import { Course, Folder, DashboardStats } from '@/types';

export const mockFolders: Folder[] = [
  {
    id: 'hr',
    name: 'Human Resources',
    children: [
      { id: 'compliance', name: 'Compliance', courses: [] },
      { id: 'security', name: 'Security', courses: [] },
      { id: 'harassment', name: 'Harassment', courses: [] },
    ],
  },
  {
    id: 'product',
    name: 'Product Enablement',
    children: [
      { id: 'product-1', name: 'Product 1', courses: [] },
      { id: 'product-2', name: 'Product 2', courses: [] },
      { id: 'product-3', name: 'Product 3', courses: [] },
    ],
  },
  {
    id: 'sales',
    name: 'Sales Enablement',
    children: [
      { id: 'role-1', name: 'Role 1', courses: [] },
      { id: 'role-2', name: 'Role 2', courses: [] },
      { id: 'role-3', name: 'Role 3', courses: [] },
    ],
  },
];

export const mockCourses: Course[] = [
  {
    id: '1',
    title: 'Objection Handling and Discovery Best Practices',
    desiredOutcome: 'Improve sales team objection handling skills',
    destinationFolder: 'sales',
    categoryTags: ['sales', 'communication'],
    dataSource: 'open-web',
    personas: [
      {
        id: 'p1',
        name: 'Sales Representative',
        role: 'Account Executive',
        kpis: 'Deals closed, Revenue generated',
        responsibilities: 'Close deals, manage pipeline',
      },
    ],
    learningObjectives: [
      { id: 'lo1', text: 'Identify common objections' },
      { id: 'lo2', text: 'Apply proven response frameworks' },
      { id: 'lo3', text: 'Practice active listening techniques' },
    ],
    sections: [
      {
        id: 's1',
        name: 'Introduction to Objection Handling',
        lessons: [
          { id: 'l1', title: 'Understanding Objections' },
          { id: 'l2', title: 'The Psychology of Buyer Resistance' },
        ],
      },
      {
        id: 's2',
        name: 'Discovery Techniques',
        lessons: [
          { id: 'l3', title: 'Asking the Right Questions' },
          { id: 'l4', title: 'Active Listening Skills' },
        ],
      },
    ],
    createdAt: '2024-10-10T10:00:00Z',
    modifiedAt: '2024-10-15T14:30:00Z',
  },
];

export const mockDashboardStats: DashboardStats = {
  totalCourses: 12,
  recentCourses: mockCourses,
  folders: mockFolders,
};
