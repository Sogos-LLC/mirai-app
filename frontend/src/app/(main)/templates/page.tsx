'use client';

import React, { useState } from 'react';
import { FileText, Plus, Search, Filter } from 'lucide-react';
import DashboardCard from '@/components/dashboard/DashboardCard';

export default function TemplatesPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const templates = [
    {
      id: 1,
      title: 'Product Launch Campaign',
      description:
        'Complete template for launching new products with email sequences and social media content',
      category: 'Marketing',
    },
    {
      id: 2,
      title: 'Blog Post Series',
      description:
        'Structured template for creating engaging blog content with SEO optimization',
      category: 'Content',
    },
    {
      id: 3,
      title: 'Email Newsletter',
      description:
        'Weekly newsletter template with customizable sections and CTAs',
      category: 'Email',
    },
    {
      id: 4,
      title: 'Social Media Calendar',
      description:
        'Monthly content calendar for scheduling posts across all platforms',
      category: 'Social',
    },
    {
      id: 5,
      title: 'Video Script',
      description:
        'Template for creating compelling video scripts with scene breakdowns',
      category: 'Video',
    },
    {
      id: 6,
      title: 'Case Study',
      description:
        'Professional case study template highlighting customer success stories',
      category: 'Content',
    },
  ];

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Templates</h1>
          <p className="text-gray-600">
            Pre-built templates to accelerate your content creation
          </p>
        </div>
        <button className="flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors">
          <Plus className="w-5 h-5" />
          Create Template
        </button>
      </div>

      <div className="flex gap-4 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <button className="flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50">
          <Filter className="w-5 h-5" />
          Filter
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template) => (
          <DashboardCard
            key={template.id}
            title={template.title}
            description={template.description}
            icon={<FileText className="w-8 h-8 text-primary-600" />}
            onClick={() => console.log('Template clicked:', template.id)}
          />
        ))}
      </div>
    </>
  );
}

