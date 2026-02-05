'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DocumentAnalysis } from '@/gen/mirai/v1/ai_generation_types_pb';

interface DocumentAnalysisCardProps {
  doc: DocumentAnalysis;
  isExpanded: boolean;
  onToggle: () => void;
}

export function DocumentAnalysisCard({ doc, isExpanded, onToggle }: DocumentAnalysisCardProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-hover transition-colors min-h-[44px]"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-primary truncate">{doc.sourceName}</p>
          <p className="text-xs text-muted">
            {doc.mainTopics?.length ?? 0} topics, {doc.keyFacts?.length ?? 0} key facts
            {doc.contentDepth && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 bg-surface-elevated rounded text-xs">
                {doc.contentDepth}
              </span>
            )}
          </p>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t">
          {/* Summary */}
          <div className="mt-3">
            <h4 className="text-sm font-semibold text-primary mb-1">Summary</h4>
            <p className="text-sm text-secondary">{doc.summary}</p>
          </div>

          {/* Main Topics */}
          {doc.mainTopics && doc.mainTopics.length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-semibold text-primary mb-1">Main Topics</h4>
              <div className="flex flex-wrap gap-1.5">
                {doc.mainTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-xs"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Key Facts */}
          {doc.keyFacts && doc.keyFacts.length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-semibold text-primary mb-1">Key Facts</h4>
              <ul className="text-sm text-secondary space-y-1">
                {doc.keyFacts.map((fact, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 mt-0.5">-</span>
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Section Hints */}
          {doc.sectionHints && doc.sectionHints.length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-semibold text-primary mb-1">Suggested Sections</h4>
              <div className="space-y-2">
                {doc.sectionHints.map((hint, i) => (
                  <div key={i} className="text-sm pl-3 border-l-2 border-indigo-200 dark:border-indigo-700">
                    <p className="font-medium text-primary">{hint.topicName}</p>
                    {hint.keyPoints && hint.keyPoints.length > 0 && (
                      <p className="text-muted text-xs mt-0.5">
                        {hint.keyPoints.slice(0, 3).join(' | ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
