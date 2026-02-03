'use client';

import { FileText, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface Citation {
  sourceId: string;
  sourceName: string;
  excerpt: string;
  relevanceScore: number;
}

interface LessonSourcePanelProps {
  citations: Citation[];
  groundingScore?: number;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * LessonSourcePanel displays knowledge source citations with excerpts and relevance scores.
 * Used to show provenance information for AI-generated lesson content.
 */
export function LessonSourcePanel({
  citations,
  groundingScore,
  isOpen,
  onClose,
}: LessonSourcePanelProps) {
  const [expandedExcerpts, setExpandedExcerpts] = useState<Set<number>>(new Set());

  if (!isOpen) return null;

  const toggleExcerpt = (index: number) => {
    setExpandedExcerpts((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (score >= 0.6) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  };

  return (
    <div className="absolute z-50 top-full left-0 mt-1 w-80 bg-surface border border-default rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-subtle bg-hover">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted" />
          <span className="text-sm font-medium text-primary">Knowledge Sources</span>
          <span className="text-xs text-muted">({citations.length})</span>
        </div>
        {groundingScore !== undefined && (
          <span
            className={`px-1.5 py-0.5 text-xs rounded ${getScoreColor(groundingScore)}`}
            title={`${Math.round(groundingScore * 100)}% grounded`}
          >
            {Math.round(groundingScore * 100)}% grounded
          </span>
        )}
      </div>

      {/* Citations list */}
      <div className="max-h-64 overflow-y-auto">
        {citations.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted text-center">
            No knowledge sources cited for this content.
          </div>
        ) : (
          <ul className="divide-y divide-subtle">
            {citations.map((citation, index) => {
              const isExpanded = expandedExcerpts.has(index);
              const excerptTruncated =
                citation.excerpt && citation.excerpt.length > 120 && !isExpanded;

              return (
                <li key={`${citation.sourceId}-${index}`} className="px-3 py-2">
                  {/* Source header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-primary truncate">
                          {citation.sourceName || 'Unknown Source'}
                        </span>
                        <ExternalLink className="w-3 h-3 text-muted flex-shrink-0" />
                      </div>
                    </div>
                    <span
                      className={`flex-shrink-0 px-1.5 py-0.5 text-xs rounded ${getScoreColor(
                        citation.relevanceScore
                      )}`}
                      title={`${Math.round(citation.relevanceScore * 100)}% relevance`}
                    >
                      {Math.round(citation.relevanceScore * 100)}%
                    </span>
                  </div>

                  {/* Excerpt */}
                  {citation.excerpt && (
                    <div className="mt-1.5">
                      <p className="text-xs text-secondary leading-relaxed">
                        &ldquo;
                        {excerptTruncated
                          ? `${citation.excerpt.slice(0, 120)}...`
                          : citation.excerpt}
                        &rdquo;
                      </p>
                      {citation.excerpt.length > 120 && (
                        <button
                          onClick={() => toggleExcerpt(index)}
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
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-subtle bg-hover">
        <button
          onClick={onClose}
          className="w-full text-xs text-muted hover:text-primary transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default LessonSourcePanel;
