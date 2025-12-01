'use client';

import { useState, useMemo } from 'react';
import type { TargetAudienceTemplate, ExperienceLevel } from '@/gen/mirai/v1/target_audience_pb';
import { TargetAudienceCard } from './TargetAudienceCard';

interface TargetAudienceListProps {
  templates: TargetAudienceTemplate[];
  isLoading?: boolean;
  onSelect: (template: TargetAudienceTemplate) => void;
  onCreate: () => void;
  onEdit?: (template: TargetAudienceTemplate) => void;
  onDelete?: (template: TargetAudienceTemplate) => void;
  selectedIds?: string[];
  selectionMode?: boolean;
}

type SortBy = 'name' | 'createdAt' | 'experienceLevel';

const EXPERIENCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Levels' },
  { value: '1', label: 'Beginner' },
  { value: '2', label: 'Intermediate' },
  { value: '3', label: 'Advanced' },
  { value: '4', label: 'Expert' },
];

export function TargetAudienceList({
  templates,
  isLoading = false,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  selectedIds = [],
  selectionMode = false,
}: TargetAudienceListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [experienceFilter, setExperienceFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredAndSortedTemplates = useMemo(() => {
    let result = [...templates];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (template) =>
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query) ||
          template.role.toLowerCase().includes(query)
      );
    }

    // Apply experience filter
    if (experienceFilter !== 'all') {
      result = result.filter(
        (template) => template.experienceLevel === parseInt(experienceFilter, 10)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'experienceLevel':
          comparison = a.experienceLevel - b.experienceLevel;
          break;
        case 'createdAt':
        default:
          const aTime = a.createdAt ? Number(a.createdAt.seconds) : 0;
          const bTime = b.createdAt ? Number(b.createdAt.seconds) : 0;
          comparison = aTime - bTime;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [templates, searchQuery, experienceFilter, sortBy, sortOrder]);

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      {!selectionMode && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Target Audience Templates</h1>
            <p className="mt-1 text-sm text-gray-500">
              Define learner profiles to customize AI-generated course content
            </p>
          </div>
          <button
            onClick={onCreate}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Template
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Experience Filter */}
        <select
          value={experienceFilter}
          onChange={(e) => setExperienceFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          {EXPERIENCE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Sort */}
        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="createdAt">Date Created</option>
            <option value="name">Name</option>
            <option value="experienceLevel">Experience Level</option>
          </select>
          <button
            onClick={toggleSortOrder}
            className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? (
              <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Selection Info */}
      {selectionMode && selectedIds.length > 0 && (
        <div className="mb-4 px-4 py-2 bg-blue-50 rounded-md text-sm text-blue-700">
          {selectedIds.length} template{selectedIds.length !== 1 ? 's' : ''} selected
        </div>
      )}

      {/* Results Count */}
      {!selectionMode && (
        <div className="mb-4 text-sm text-gray-500">
          Showing {filteredAndSortedTemplates.length} of {templates.length} templates
        </div>
      )}

      {/* Template Grid */}
      {filteredAndSortedTemplates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedTemplates.map((template) => (
            <TargetAudienceCard
              key={template.id}
              template={template}
              onSelect={() => onSelect(template)}
              onEdit={onEdit ? () => onEdit(template) : undefined}
              onDelete={onDelete ? () => onDelete(template) : undefined}
              isSelected={selectedIds.includes(template.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          {templates.length === 0 ? (
            <>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No templates yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Create target audience templates to personalize course content.
              </p>
              {!selectionMode && (
                <div className="mt-6">
                  <button
                    onClick={onCreate}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Template
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No matching templates</h3>
              <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filter criteria.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
