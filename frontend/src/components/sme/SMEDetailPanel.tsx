'use client';

import { useState } from 'react';
import type { SubjectMatterExpert, SMEKnowledgeChunk, SMEStatus } from '@/gen/mirai/v1/sme_pb';

interface SMEDetailPanelProps {
  sme: SubjectMatterExpert;
  chunks?: SMEKnowledgeChunk[];
  isIngesting?: boolean;
  ingestionProgress?: number;
  onBack: () => void;
  onStartIngestion?: () => void;
  onCancelIngestion?: () => void;
  onDelete?: () => void;
}

const STATUS_CONFIG: Record<number, { label: string; color: string; icon: string }> = {
  0: { label: 'Unknown', color: 'bg-gray-100 text-gray-800', icon: '?' },
  1: { label: 'Draft', color: 'bg-yellow-100 text-yellow-800', icon: '📝' },
  2: { label: 'Ingesting', color: 'bg-blue-100 text-blue-800', icon: '⚙️' },
  3: { label: 'Active', color: 'bg-green-100 text-green-800', icon: '✓' },
  4: { label: 'Archived', color: 'bg-gray-100 text-gray-600', icon: '📦' },
};

export function SMEDetailPanel({
  sme,
  chunks = [],
  isIngesting = false,
  ingestionProgress = 0,
  onBack,
  onStartIngestion,
  onCancelIngestion,
  onDelete,
}: SMEDetailPanelProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const status = STATUS_CONFIG[sme.status] || STATUS_CONFIG[0];

  return (
    <div className="bg-white shadow rounded-lg">
      {/* Header */}
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <svg className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to list
          </button>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
            {status.icon} {status.label}
          </span>
        </div>

        <div className="mt-4">
          <h2 className="text-2xl font-bold text-gray-900">{sme.name}</h2>
          {sme.description && <p className="mt-1 text-sm text-gray-500">{sme.description}</p>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {sme.domain && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-purple-100 text-purple-800">
              {sme.domain}
            </span>
          )}
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-gray-100 text-gray-700">
            {sme.scope === 1 ? 'Global' : 'Team'}
          </span>
        </div>
      </div>

      {/* Ingestion Progress */}
      {isIngesting && (
        <div className="px-4 py-4 sm:px-6 border-b border-gray-200 bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">Ingesting knowledge...</span>
            {onCancelIngestion && (
              <button
                onClick={onCancelIngestion}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Cancel
              </button>
            )}
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${ingestionProgress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-blue-600">{ingestionProgress}% complete</p>
        </div>
      )}

      {/* Knowledge Summary */}
      <div className="px-4 py-5 sm:px-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Knowledge Summary</h3>
        {sme.knowledgeSummary ? (
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-700 whitespace-pre-wrap">{sme.knowledgeSummary}</p>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
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
            <p className="mt-2">No knowledge ingested yet</p>
            <p className="text-sm">Start ingestion to analyze and distill knowledge</p>
          </div>
        )}
      </div>

      {/* Knowledge Chunks */}
      {chunks.length > 0 && (
        <div className="px-4 py-5 sm:px-6 border-t border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Knowledge Chunks ({chunks.length})
          </h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {chunks.map((chunk) => (
              <div key={chunk.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">{chunk.topic}</span>
                  <span className="text-xs text-gray-500">
                    Score: {(chunk.relevanceScore * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-3">{chunk.content}</p>
                {chunk.keywords && chunk.keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {chunk.keywords.slice(0, 5).map((keyword, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-700"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-4 sm:px-6 border-t border-gray-200 bg-gray-50">
        <div className="flex flex-wrap gap-3">
          {onStartIngestion && sme.status !== 2 && (
            <button
              onClick={onStartIngestion}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {sme.knowledgeSummary ? 'Re-ingest Knowledge' : 'Start Ingestion'}
            </button>
          )}
          {onDelete && (
            <>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">Are you sure?</span>
                  <button
                    onClick={onDelete}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700"
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Delete SME
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="px-4 py-3 sm:px-6 border-t border-gray-200 text-xs text-gray-400">
        <div className="flex flex-wrap gap-4">
          {sme.createdAt && (
            <span>Created: {new Date(Number(sme.createdAt.seconds) * 1000).toLocaleString()}</span>
          )}
          {sme.updatedAt && (
            <span>Updated: {new Date(Number(sme.updatedAt.seconds) * 1000).toLocaleString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
