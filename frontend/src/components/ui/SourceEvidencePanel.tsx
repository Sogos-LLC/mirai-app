'use client';

import { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, X, Database } from 'lucide-react';

export interface SourceChunk {
  chunkId: string;
  sourceId: string;
  sourceName: string;
  excerpt: string;
  similarityScore: number;
  scope: 'course' | 'team' | 'global';
}

export interface SourceEvidencePanelProps {
  /** Contributing source chunks */
  chunks: SourceChunk[];
  /** Overall grounding score (0.0 - 1.0) */
  groundingScore?: number;
  /** Token breakdown by scope */
  tokenBreakdown?: {
    teamTokens: number;
    globalTokens: number;
    courseTokens: number;
  };
  /** Panel title */
  title?: string;
  /** Whether panel is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
}

/**
 * SourceEvidencePanel displays knowledge source evidence for generated content.
 * Shows which chunks from which sources contributed, with excerpts and relevance scores.
 */
export default function SourceEvidencePanel({
  chunks,
  groundingScore,
  tokenBreakdown,
  title = 'Knowledge Sources',
  isOpen,
  onClose,
}: SourceEvidencePanelProps) {
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const toggleChunk = (chunkId: string) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) {
        next.delete(chunkId);
      } else {
        next.add(chunkId);
      }
      return next;
    });
  };

  const getScopeColor = (scope: string) => {
    switch (scope) {
      case 'course':
        return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
      case 'team':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'global':
        return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 dark:text-green-400';
    if (score >= 0.6) return 'text-blue-600 dark:text-blue-400';
    return 'text-amber-600 dark:text-amber-400';
  };

  // Group chunks by source
  const chunksBySource = chunks.reduce((acc, chunk) => {
    if (!acc[chunk.sourceId]) {
      acc[chunk.sourceId] = {
        sourceName: chunk.sourceName,
        scope: chunk.scope,
        chunks: [],
      };
    }
    acc[chunk.sourceId].chunks.push(chunk);
    return acc;
  }, {} as Record<string, { sourceName: string; scope: string; chunks: SourceChunk[] }>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-surface border rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span className="font-semibold text-primary">{title}</span>
            <span className="text-xs text-muted">({chunks.length} chunks)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-hover transition-colors"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Grounding summary */}
        {(groundingScore !== undefined || tokenBreakdown) && (
          <div className="px-4 py-3 border-b bg-hover">
            <div className="flex items-center justify-between text-sm">
              {groundingScore !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-secondary">Grounding:</span>
                  <span className={`font-semibold ${getScoreColor(groundingScore)}`}>
                    {Math.round(groundingScore * 100)}%
                  </span>
                </div>
              )}
              {tokenBreakdown && (
                <div className="flex items-center gap-3 text-xs text-muted">
                  {tokenBreakdown.courseTokens > 0 && (
                    <span>Course: {tokenBreakdown.courseTokens}</span>
                  )}
                  {tokenBreakdown.teamTokens > 0 && (
                    <span>Team: {tokenBreakdown.teamTokens}</span>
                  )}
                  {tokenBreakdown.globalTokens > 0 && (
                    <span>Global: {tokenBreakdown.globalTokens}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Source list */}
        <div className="flex-1 overflow-y-auto">
          {Object.keys(chunksBySource).length === 0 ? (
            <div className="px-4 py-8 text-center text-muted">
              No knowledge sources contributed to this content.
            </div>
          ) : (
            <div className="divide-y">
              {Object.entries(chunksBySource).map(([sourceId, { sourceName, scope, chunks: sourceChunks }]) => (
                <div key={sourceId} className="px-4 py-3">
                  {/* Source header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted" />
                      <span className="text-sm font-medium text-primary">
                        {sourceName || 'Unknown Source'}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getScopeColor(scope)}`}>
                      {scope}
                    </span>
                  </div>

                  {/* Chunks from this source */}
                  <div className="space-y-2 ml-6">
                    {sourceChunks.map((chunk) => {
                      const isExpanded = expandedChunks.has(chunk.chunkId);
                      const needsTruncation = chunk.excerpt && chunk.excerpt.length > 150;

                      return (
                        <div
                          key={chunk.chunkId}
                          className="p-2 bg-page rounded border border-subtle"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-secondary flex-1">
                              &ldquo;
                              {needsTruncation && !isExpanded
                                ? `${chunk.excerpt.slice(0, 150)}...`
                                : chunk.excerpt}
                              &rdquo;
                            </p>
                            <span
                              className={`flex-shrink-0 text-xs font-medium ${getScoreColor(chunk.similarityScore)}`}
                              title={`${Math.round(chunk.similarityScore * 100)}% relevance`}
                            >
                              {Math.round(chunk.similarityScore * 100)}%
                            </span>
                          </div>
                          {needsTruncation && (
                            <button
                              onClick={() => toggleChunk(chunk.chunkId)}
                              className="mt-1 flex items-center gap-0.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="w-3 h-3" />
                                  Show less
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3 h-3" />
                                  Show more
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t bg-hover">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm font-medium text-primary bg-surface border rounded hover:bg-page transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
