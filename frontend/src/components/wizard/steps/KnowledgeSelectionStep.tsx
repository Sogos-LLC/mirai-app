'use client';

import React from 'react';
import { BookOpen, Check, Library, Globe, AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import type { WizardKnowledgeSource } from '@/machines/courseWizardMachine';
import { formatTokenCount, stripMarkdown } from '@/components/knowledge/fileUploadUtils';
import WizardNavigation from '../WizardNavigation';

interface KnowledgeSelectionStepProps {
  teamDocs: WizardKnowledgeSource[];
  globalDocs: WizardKnowledgeSource[];
  selectedTeamDocIds: string[];
  selectedGlobalDocIds: string[];
  onToggleTeamDoc: (docId: string) => void;
  onToggleGlobalDoc: (docId: string) => void;
  onSelectAllTeamDocs: () => void;
  onDeselectAllTeamDocs: () => void;
  onSelectAllGlobalDocs: () => void;
  onDeselectAllGlobalDocs: () => void;
  onNext: () => void;
  onSkip: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function KnowledgeSelectionStep({
  teamDocs,
  globalDocs,
  selectedTeamDocIds,
  selectedGlobalDocIds,
  onToggleTeamDoc,
  onToggleGlobalDoc,
  onSelectAllTeamDocs,
  onDeselectAllTeamDocs,
  onSelectAllGlobalDocs,
  onDeselectAllGlobalDocs,
  onNext,
  onSkip,
  onCancel,
  isLoading = false,
}: KnowledgeSelectionStepProps) {
  const hasTeamDocs = teamDocs.length > 0;
  const hasGlobalDocs = globalDocs.length > 0;
  const hasAnyDocs = hasTeamDocs || hasGlobalDocs;

  const selectedTeamTokens = teamDocs
    .filter((doc) => selectedTeamDocIds.includes(doc.id))
    .reduce((sum, doc) => sum + doc.tokenCount, 0);

  const selectedGlobalTokens = globalDocs
    .filter((doc) => selectedGlobalDocIds.includes(doc.id))
    .reduce((sum, doc) => sum + doc.tokenCount, 0);

  const totalSelectedTokens = selectedTeamTokens + selectedGlobalTokens;
  const totalSelectedDocs = selectedTeamDocIds.length + selectedGlobalDocIds.length;
  const hasSelection = totalSelectedDocs > 0;

  // Warning if sources exist but none selected
  const showNoSelectionWarning = hasAnyDocs && !hasSelection;

  return (
    <Card>
      <CardContent className="py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-primary">
                Select Knowledge Sources
              </h2>
              <p className="text-sm sm:text-base text-secondary">
                Choose which documents to use for grounding your course content.
              </p>
            </div>
          </div>

          {/* Selected tokens summary */}
          {hasSelection && (
            <div className="mb-6 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
                  {totalSelectedDocs} document{totalSelectedDocs !== 1 ? 's' : ''} selected
                </span>
                <span className="text-sm text-indigo-700 dark:text-indigo-300">
                  {formatTokenCount(totalSelectedTokens)} of context
                </span>
              </div>
            </div>
          )}

          {/* Warning banner */}
          {showNoSelectionWarning && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <span className="font-semibold">No knowledge sources selected.</span>
                <span className="block mt-1 text-amber-700 dark:text-amber-300">
                  Your course will be generated without grounding from your documents.
                  Select sources above or continue without knowledge-based grounding.
                </span>
              </div>
            </div>
          )}

          {/* Team Knowledge Section */}
          {hasTeamDocs && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Library className="w-4 h-4 text-muted" />
                  <h3 className="text-sm font-semibold text-primary">Team Knowledge</h3>
                  <span className="text-xs text-muted">
                    ({teamDocs.length} document{teamDocs.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectedTeamDocIds.length === teamDocs.length ? onDeselectAllTeamDocs : onSelectAllTeamDocs}
                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                  >
                    {selectedTeamDocIds.length === teamDocs.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {teamDocs.map((doc) => {
                  const isSelected = selectedTeamDocIds.includes(doc.id);
                  return (
                    <button
                      key={doc.id}
                      onClick={() => onToggleTeamDoc(doc.id)}
                      className={`
                        w-full p-3 rounded-lg border-2 text-left transition-all
                        ${isSelected
                          ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                          : 'border-transparent bg-surface hover:border-gray-300 dark:hover:border-gray-600'
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className={`
                              w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                              ${isSelected
                                ? 'bg-primary-600 border-primary-600'
                                : 'border-gray-300 dark:border-gray-600'
                              }
                            `}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-primary truncate">{doc.name}</p>
                            {doc.summary && (
                              <p className="text-xs text-muted line-clamp-1 mt-0.5">{stripMarkdown(doc.summary)}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted ml-2 flex-shrink-0">
                          {formatTokenCount(doc.tokenCount)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Global Knowledge Section */}
          {hasGlobalDocs && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted" />
                  <h3 className="text-sm font-semibold text-primary">Global Knowledge</h3>
                  <span className="text-xs text-muted">
                    ({globalDocs.length} document{globalDocs.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectedGlobalDocIds.length === globalDocs.length ? onDeselectAllGlobalDocs : onSelectAllGlobalDocs}
                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                  >
                    {selectedGlobalDocIds.length === globalDocs.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {globalDocs.map((doc) => {
                  const isSelected = selectedGlobalDocIds.includes(doc.id);
                  return (
                    <button
                      key={doc.id}
                      onClick={() => onToggleGlobalDoc(doc.id)}
                      className={`
                        w-full p-3 rounded-lg border-2 text-left transition-all
                        ${isSelected
                          ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                          : 'border-transparent bg-surface hover:border-gray-300 dark:hover:border-gray-600'
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className={`
                              w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                              ${isSelected
                                ? 'bg-primary-600 border-primary-600'
                                : 'border-gray-300 dark:border-gray-600'
                              }
                            `}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-primary truncate">{doc.name}</p>
                            {doc.summary && (
                              <p className="text-xs text-muted line-clamp-1 mt-0.5">{stripMarkdown(doc.summary)}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted ml-2 flex-shrink-0">
                          {formatTokenCount(doc.tokenCount)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Skip link */}
          <div className="text-center mb-4">
            <button
              onClick={onSkip}
              className="text-sm text-muted hover:text-secondary underline"
            >
              Continue without knowledge sources
              <ChevronRight className="w-4 h-4 inline ml-1" />
            </button>
          </div>
        </div>

        <WizardNavigation
          onCancel={onCancel}
          onNext={onNext}
          canGoBack={false}
          canGoNext={true}
          isLoading={isLoading}
          nextLabel={hasSelection ? 'Continue with Selection' : 'Continue without Knowledge'}
        />
      </CardContent>
    </Card>
  );
}
