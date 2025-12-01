'use client';

import { useState, useMemo } from 'react';
import type { SubjectMatterExpert, SMEScope, SMEStatus } from '@/gen/mirai/v1/sme_pb';
import { SMECard } from './SMECard';

interface SMEListProps {
  smes: SubjectMatterExpert[];
  isLoading?: boolean;
  onSelect: (sme: SubjectMatterExpert) => void;
  onCreate: () => void;
  onDelete?: (sme: SubjectMatterExpert) => void;
}

type SortBy = 'name' | 'createdAt' | 'status';
type SortOrder = 'asc' | 'desc';

const SCOPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Scopes' },
  { value: '1', label: 'Global' },
  { value: '2', label: 'Team' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: '1', label: 'Draft' },
  { value: '2', label: 'Ingesting' },
  { value: '3', label: 'Active' },
  { value: '4', label: 'Archived' },
];

export function SMEList({ smes, isLoading = false, onSelect, onCreate, onDelete }: SMEListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const filteredAndSortedSMEs = useMemo(() => {
    let result = [...smes];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (sme) =>
          sme.name.toLowerCase().includes(query) ||
          sme.description.toLowerCase().includes(query) ||
          sme.domain.toLowerCase().includes(query)
      );
    }

    // Apply scope filter
    if (scopeFilter !== 'all') {
      result = result.filter((sme) => sme.scope === parseInt(scopeFilter, 10));
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((sme) => sme.status === parseInt(statusFilter, 10));
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'status':
          comparison = a.status - b.status;
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
  }, [smes, searchQuery, scopeFilter, statusFilter, sortBy, sortOrder]);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subject Matter Experts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your organization&apos;s knowledge sources for AI course generation
          </p>
        </div>
        <button
          onClick={onCreate}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create SME
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            placeholder="Search SMEs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Scope Filter */}
        <select
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          {SCOPE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
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
            <option value="status">Status</option>
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

      {/* Results Count */}
      <div className="mb-4 text-sm text-gray-500">
        Showing {filteredAndSortedSMEs.length} of {smes.length} SMEs
      </div>

      {/* SME Grid */}
      {filteredAndSortedSMEs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedSMEs.map((sme) => (
            <SMECard
              key={sme.id}
              sme={sme}
              onSelect={() => onSelect(sme)}
              onDelete={onDelete ? () => onDelete(sme) : undefined}
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          {smes.length === 0 ? (
            <>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No SMEs yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating your first Subject Matter Expert.
              </p>
              <div className="mt-6">
                <button
                  onClick={onCreate}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create SME
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No matching SMEs</h3>
              <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filter criteria.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
