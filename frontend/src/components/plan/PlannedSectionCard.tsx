'use client';

import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Search,
  Lightbulb,
} from 'lucide-react';
import type { PlannedSection } from '@/gen/mirai/v1/ai_generation_types_pb';

interface PlannedSectionCardProps {
  section: PlannedSection;
  sectionIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export function PlannedSectionCard({ section, sectionIndex, isExpanded, onToggle }: PlannedSectionCardProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-hover transition-colors min-h-[44px]"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
        )}
        <span className="flex items-center justify-center w-7 h-7 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-bold flex-shrink-0">
          {sectionIndex + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-primary">{section.title}</p>
          <p className="text-xs text-muted">
            {section.lessons?.length ?? 0} lesson{(section.lessons?.length ?? 0) !== 1 ? 's' : ''}
            {section.sourceIds && section.sourceIds.length > 0 && (
              <span className="ml-2">
                from {section.sourceIds.length} source{section.sourceIds.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 ml-14">
          {/* Description */}
          {section.description && (
            <p className="text-sm text-secondary mb-3">{section.description}</p>
          )}

          {/* Rationale */}
          {section.rationale && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg mb-3">
              <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">{section.rationale}</p>
            </div>
          )}

          {/* Search Terms */}
          {section.searchTerms && section.searchTerms.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Search className="w-3.5 h-3.5 text-muted" />
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Search Terms</h4>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {section.searchTerms.map((term, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded text-xs"
                  >
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Lessons */}
          {section.lessons && section.lessons.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Lessons</h4>
              <div className="space-y-2">
                {section.lessons.map((lesson, lIdx) => (
                  <div key={lIdx} className="border rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-mono text-muted mt-0.5">
                        {sectionIndex + 1}.{lIdx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-primary">{lesson.title}</p>
                        {lesson.description && (
                          <p className="text-xs text-secondary mt-0.5">{lesson.description}</p>
                        )}

                        {/* Lesson Learning Goals */}
                        {lesson.learningGoals && lesson.learningGoals.length > 0 && (
                          <div className="mt-2">
                            <ul className="text-xs text-secondary space-y-0.5">
                              {lesson.learningGoals.map((goal, gIdx) => (
                                <li key={gIdx} className="flex items-start gap-1.5">
                                  <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                                  <span>{goal}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Lesson Search Terms */}
                        {lesson.searchTerms && lesson.searchTerms.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {lesson.searchTerms.map((term, tIdx) => (
                              <span
                                key={tIdx}
                                className="inline-flex items-center px-1.5 py-0.5 bg-surface-elevated text-muted rounded text-[10px]"
                              >
                                {term}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
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
