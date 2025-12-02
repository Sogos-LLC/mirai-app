'use client';

import type { SubjectMatterExpert, SMEStatus, SMEScope } from '@/gen/mirai/v1/sme_pb';

interface SMECardProps {
  sme: SubjectMatterExpert;
  onSelect: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onRestore?: () => void;
}

const STATUS_LABELS: Record<number, { label: string; color: string; hint: string }> = {
  0: { label: 'Unknown', color: 'bg-gray-100 text-gray-800', hint: 'Status unknown' },
  1: { label: 'Draft', color: 'bg-yellow-100 text-yellow-800', hint: 'Add content to activate this SME' },
  2: { label: 'Ingesting', color: 'bg-blue-100 text-blue-800', hint: 'AI is processing submitted content' },
  3: { label: 'Active', color: 'bg-green-100 text-green-800', hint: 'Ready for course generation' },
  4: { label: 'Archived', color: 'bg-gray-100 text-gray-600', hint: 'This SME has been archived' },
};

const SCOPE_LABELS: Record<number, string> = {
  0: 'Unknown',
  1: 'Global',
  2: 'Team',
};

export function SMECard({ sme, onSelect, onDelete, onEdit, onRestore }: SMECardProps) {
  const status = STATUS_LABELS[sme.status] || STATUS_LABELS[0];
  const scope = SCOPE_LABELS[sme.scope] || SCOPE_LABELS[0];
  const isArchived = sme.status === 4; // SME_STATUS_ARCHIVED

  return (
    <div className={`bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow ${isArchived ? 'opacity-60' : ''}`}>
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-medium text-gray-900 truncate">{sme.name}</h3>
          <div className="flex items-center space-x-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color} cursor-help`}
              title={status.hint}
            >
              {status.label}
            </span>
            {/* Edit button - show for non-archived items */}
            {onEdit && !isArchived && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="text-gray-600 hover:text-blue-600 text-sm font-medium"
                title="Edit SME"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
            )}
            {/* Restore button - show for archived items */}
            {onRestore && isArchived && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore();
                }}
                className="text-green-600 hover:text-green-800 text-sm font-medium"
                title="Restore SME"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            )}
            {/* Delete button - show for non-archived items */}
            {onDelete && !isArchived && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
                title="Archive SME"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {sme.description && <p className="text-sm text-gray-500 mb-4 line-clamp-2">{sme.description}</p>}

        {/* Draft status hint */}
        {sme.status === 1 && (
          <div className="mb-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Submit content to activate this SME for course generation</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          {sme.domain && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-800">
              {sme.domain}
            </span>
          )}
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
            {scope}
          </span>
        </div>

        {/* Context Package Indicator */}
        {sme.status === 3 && sme.knowledgeSummary && (
          <div className="mb-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-md border border-green-200">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">Context Package Ready</span>
            <span className="text-green-600">- Available for AI course generation</span>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center text-sm text-gray-500">
            <svg
              className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <span>{sme.knowledgeSummary ? 'Knowledge base populated' : 'No knowledge yet'}</span>
          </div>

          <button onClick={onSelect} className="text-sm font-medium text-blue-600 hover:text-blue-800">
            View Details
          </button>
        </div>

        {sme.createdAt && (
          <div className="mt-2 text-xs text-gray-400">
            Created {new Date(Number(sme.createdAt.seconds) * 1000).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}
