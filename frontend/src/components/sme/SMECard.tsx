'use client';

import type { SubjectMatterExpert, SMEStatus, SMEScope } from '@/gen/mirai/v1/sme_pb';

interface SMECardProps {
  sme: SubjectMatterExpert;
  onSelect: () => void;
  onDelete?: () => void;
}

const STATUS_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Unknown', color: 'bg-gray-100 text-gray-800' },
  1: { label: 'Draft', color: 'bg-yellow-100 text-yellow-800' },
  2: { label: 'Ingesting', color: 'bg-blue-100 text-blue-800' },
  3: { label: 'Active', color: 'bg-green-100 text-green-800' },
  4: { label: 'Archived', color: 'bg-gray-100 text-gray-600' },
};

const SCOPE_LABELS: Record<number, string> = {
  0: 'Unknown',
  1: 'Global',
  2: 'Team',
};

export function SMECard({ sme, onSelect, onDelete }: SMECardProps) {
  const status = STATUS_LABELS[sme.status] || STATUS_LABELS[0];
  const scope = SCOPE_LABELS[sme.scope] || SCOPE_LABELS[0];

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-medium text-gray-900 truncate">{sme.name}</h3>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
              {status.label}
            </span>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
                title="Delete SME"
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span>{sme.knowledgeSummary ? 'Has knowledge' : 'No knowledge yet'}</span>
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
