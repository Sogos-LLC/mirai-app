'use client';

import { useState } from 'react';
import type { SMEKnowledgeChunk } from '@/gen/mirai/v1/sme_pb';

interface KnowledgeChunkCardProps {
  chunk: SMEKnowledgeChunk;
  onEdit?: (chunk: SMEKnowledgeChunk) => void;
  onDelete?: (chunkId: string) => void;
  isDeleting?: boolean;
}

export function KnowledgeChunkCard({
  chunk,
  onEdit,
  onDelete,
  isDeleting = false,
}: KnowledgeChunkCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleDelete = () => {
    if (onDelete) {
      onDelete(chunk.id);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className={`p-3 bg-gray-50 rounded-lg border border-gray-200 ${isDeleting ? 'opacity-50' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900 block truncate">{chunk.topic || 'Untitled'}</span>
          {chunk.submissionId && (
            <span className="text-xs text-gray-400">From submission</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded">
            {(chunk.relevanceScore * 100).toFixed(0)}%
          </span>
          {/* Actions dropdown */}
          {(onEdit || onDelete) && !showDeleteConfirm && (
            <div className="flex gap-1">
              {onEdit && (
                <button
                  onClick={() => onEdit(chunk)}
                  className="p-1 text-gray-400 hover:text-blue-600 rounded"
                  title="Edit chunk"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1 text-gray-400 hover:text-red-600 rounded"
                  title="Delete chunk"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="mb-2 p-2 bg-red-50 rounded border border-red-200">
          <p className="text-xs text-red-700 mb-2">Delete this knowledge chunk?</p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-2 py-1 text-xs font-medium text-gray-700 bg-white rounded border border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative">
        <p className={`text-sm text-gray-600 ${isExpanded ? '' : 'line-clamp-3'}`}>
          {chunk.content}
        </p>
        {chunk.content.length > 200 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-blue-600 hover:text-blue-800 mt-1"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Keywords */}
      {chunk.keywords && chunk.keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {chunk.keywords.slice(0, isExpanded ? undefined : 5).map((keyword, idx) => (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-700"
            >
              {keyword}
            </span>
          ))}
          {!isExpanded && chunk.keywords.length > 5 && (
            <span className="text-xs text-gray-400">+{chunk.keywords.length - 5} more</span>
          )}
        </div>
      )}

      {/* Metadata */}
      {chunk.createdAt && (
        <div className="mt-2 text-xs text-gray-400">
          Added: {new Date(Number(chunk.createdAt.seconds) * 1000).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
