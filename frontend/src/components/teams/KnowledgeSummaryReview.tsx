'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Pencil,
  X,
  ChevronDown,
  ChevronRight,
  Plus,
  Loader2,
  FileText,
  AlertCircle,
  Check,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useUpdateKnowledgeSourceIndex } from '@/hooks/useTeamKnowledge';
import type { KnowledgeSource, TopicWithExcerpts, ContentExcerpt } from '@/gen/mirai/v1/knowledge_source_pb';

export interface KnowledgeSummaryReviewProps {
  /** The knowledge source to review */
  source: KnowledgeSource;
  /** Called after successful save */
  onSave: () => void;
  /** Close the review modal/panel */
  onClose: () => void;
  /** Changes action buttons based on context */
  context: 'upload' | 'wizard';
}

/**
 * KnowledgeSummaryReview - Human-in-the-loop document review component
 *
 * Shows after document ingestion completes, allowing users to review
 * and edit the AI-generated summary before saving.
 */
export function KnowledgeSummaryReview({
  source,
  onSave,
  onClose,
  context,
}: KnowledgeSummaryReviewProps) {
  // State for editing modes
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [isEditingTopics, setIsEditingTopics] = useState(false);
  const [isEditingConcepts, setIsEditingConcepts] = useState(false);

  // Initialize editable state from source
  const [summary, setSummary] = useState(source.summary ?? '');
  const [topics, setTopics] = useState<TopicWithExcerpts[]>(
    source.documentIndex?.topicsWithExcerpts ?? []
  );
  const [keyConcepts, setKeyConcepts] = useState<string[]>(
    source.documentIndex?.keyConcepts ?? []
  );

  // Accordion state for topics
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());

  // New concept input state
  const [newConcept, setNewConcept] = useState('');
  const [showConceptInput, setShowConceptInput] = useState(false);

  // Hook for saving updates
  const updateIndex = useUpdateKnowledgeSourceIndex();

  // Check if there are any unsaved changes
  const hasChanges = useMemo(() => {
    const originalSummary = source.summary ?? '';
    const originalTopics = source.documentIndex?.topicsWithExcerpts ?? [];
    const originalConcepts = source.documentIndex?.keyConcepts ?? [];

    if (summary !== originalSummary) return true;
    if (keyConcepts.length !== originalConcepts.length) return true;
    if (!keyConcepts.every((c, i) => c === originalConcepts[i])) return true;
    if (topics.length !== originalTopics.length) return true;
    // Deep compare topics
    for (let i = 0; i < topics.length; i++) {
      if (topics[i].topic !== originalTopics[i].topic) return true;
    }
    return false;
  }, [summary, topics, keyConcepts, source]);

  // Toggle topic expansion
  const toggleTopic = useCallback((index: number) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Update topic name
  const updateTopicName = useCallback((index: number, newName: string) => {
    setTopics((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], topic: newName };
      return updated;
    });
  }, []);

  // Remove a concept
  const removeConcept = useCallback((index: number) => {
    setKeyConcepts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Add a new concept
  const addConcept = useCallback(() => {
    const trimmed = newConcept.trim();
    if (trimmed && !keyConcepts.includes(trimmed)) {
      setKeyConcepts((prev) => [...prev, trimmed]);
      setNewConcept('');
      setShowConceptInput(false);
    }
  }, [newConcept, keyConcepts]);

  // Handle save
  const handleSave = async () => {
    try {
      await updateIndex.mutate({
        sourceId: source.id,
        summary,
        topics,
        keyConcepts,
      });
      onSave();
    } catch (err) {
      console.error('Failed to save knowledge source index:', err);
    }
  };

  // Format relevance score as percentage
  const formatRelevance = (score: number): string => {
    return `${Math.round(score * 100)}%`;
  };

  // Get relevance badge color
  const getRelevanceBadgeClass = (score: number): string => {
    if (score >= 0.8) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-primary">
              Review Summary; finalize details
            </h2>
            <p className="text-sm text-secondary">{source.name}</p>
          </div>
        </div>
        <button
          onClick={() => setIsEditingSummary(!isEditingSummary)}
          className="p-2 rounded-lg hover:bg-hover text-muted hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          title="Toggle edit mode"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto py-4 space-y-6">
        {/* Summary Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">Summary:</h3>
            <button
              onClick={() => setIsEditingSummary(!isEditingSummary)}
              className="p-1.5 rounded hover:bg-hover text-muted hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              title={isEditingSummary ? 'Done editing' : 'Edit summary'}
            >
              {isEditingSummary ? (
                <Check className="w-4 h-4" />
              ) : (
                <Pencil className="w-4 h-4" />
              )}
            </button>
          </div>
          {isEditingSummary ? (
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-surface border rounded-lg
                focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                text-primary placeholder:text-muted resize-none"
              placeholder="Enter document summary..."
            />
          ) : (
            <p className="text-secondary text-sm leading-relaxed bg-hover rounded-lg p-4">
              {summary || 'No summary available'}
            </p>
          )}
        </div>

        {/* Topics and Sections - Accordion */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">Key Topics and Sections:</h3>
            <button
              onClick={() => setIsEditingTopics(!isEditingTopics)}
              className="p-1.5 rounded hover:bg-hover text-muted hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              title={isEditingTopics ? 'Done editing' : 'Edit topics'}
            >
              {isEditingTopics ? (
                <Check className="w-4 h-4" />
              ) : (
                <Pencil className="w-4 h-4" />
              )}
            </button>
          </div>

          {topics.length > 0 ? (
            <div className="border rounded-lg overflow-hidden divide-y">
              {topics.map((topicItem, index) => {
                const isExpanded = expandedTopics.has(index);
                const excerpts = topicItem.excerpts ?? [];

                return (
                  <div key={index} className="bg-surface">
                    {/* Topic Header */}
                    <div
                      className={`
                        flex items-center gap-2 px-4 py-3 cursor-pointer
                        hover:bg-hover transition-colors
                        ${isExpanded ? 'bg-hover' : ''}
                      `}
                      onClick={() => toggleTopic(index)}
                    >
                      <button className="flex-shrink-0 text-muted">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      {isEditingTopics ? (
                        <input
                          type="text"
                          value={topicItem.topic}
                          onChange={(e) => updateTopicName(index, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 px-2 py-1 bg-surface border rounded
                            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                            text-primary text-sm"
                        />
                      ) : (
                        <span className="flex-1 text-sm font-medium text-primary">
                          {topicItem.topic}
                        </span>
                      )}
                      <span className="text-xs text-muted">
                        {excerpts.length} excerpt{excerpts.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Excerpts (expanded content) */}
                    {isExpanded && excerpts.length > 0 && (
                      <div className="px-4 pb-3 pt-1 space-y-2 bg-page">
                        {excerpts.map((excerpt: ContentExcerpt, excerptIndex: number) => (
                          <div
                            key={excerptIndex}
                            className="p-3 bg-surface rounded-lg border border-subtle"
                          >
                            <p className="text-sm text-secondary leading-relaxed">
                              {excerpt.content}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <span
                                className={`
                                  inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                                  ${getRelevanceBadgeClass(excerpt.relevanceScore)}
                                `}
                              >
                                Relevance: {formatRelevance(excerpt.relevanceScore)}
                              </span>
                              <span className="text-xs text-muted">
                                Chunk {excerpt.chunkIndex}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* No excerpts message */}
                    {isExpanded && excerpts.length === 0 && (
                      <div className="px-4 pb-3 pt-1 bg-page">
                        <p className="text-sm text-muted italic">
                          No excerpts available for this topic.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 bg-hover rounded-lg">
              <p className="text-sm text-muted">No topics identified</p>
            </div>
          )}
        </div>

        {/* Key Concepts - Chips */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">Key Concepts:</h3>
            <button
              onClick={() => setIsEditingConcepts(!isEditingConcepts)}
              className="p-1.5 rounded hover:bg-hover text-muted hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              title={isEditingConcepts ? 'Done editing' : 'Edit concepts'}
            >
              {isEditingConcepts ? (
                <Check className="w-4 h-4" />
              ) : (
                <Pencil className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {keyConcepts.map((concept, index) => (
              <span
                key={index}
                className={`
                  inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm
                  bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300
                  ${isEditingConcepts ? 'pr-1.5' : ''}
                `}
              >
                {concept}
                {isEditingConcepts && (
                  <button
                    onClick={() => removeConcept(index)}
                    className="p-0.5 rounded-full hover:bg-primary-200 dark:hover:bg-primary-800/50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            ))}

            {/* Add concept button/input */}
            {isEditingConcepts && (
              <>
                {showConceptInput ? (
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="text"
                      value={newConcept}
                      onChange={(e) => setNewConcept(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addConcept();
                        } else if (e.key === 'Escape') {
                          setShowConceptInput(false);
                          setNewConcept('');
                        }
                      }}
                      placeholder="New concept..."
                      className="px-2 py-1 text-sm bg-surface border rounded
                        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                        text-primary placeholder:text-muted w-32"
                      autoFocus
                    />
                    <button
                      onClick={addConcept}
                      disabled={!newConcept.trim()}
                      className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-primary-600 dark:text-primary-400 disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setShowConceptInput(false);
                        setNewConcept('');
                      }}
                      className="p-1 rounded hover:bg-hover text-muted"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowConceptInput(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm
                      border-2 border-dashed border-primary-300 dark:border-primary-700
                      text-primary-600 dark:text-primary-400 hover:border-primary-500 dark:hover:border-primary-500
                      hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                )}
              </>
            )}

            {keyConcepts.length === 0 && !isEditingConcepts && (
              <p className="text-sm text-muted italic">No key concepts identified</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t space-y-3">
        {/* Help text */}
        <p className="text-sm text-muted text-center">
          Does this look accurate? Click pencil to edit
        </p>

        {/* Error display */}
        {updateIndex.error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Failed to save changes. Please try again.
          </div>
        )}

        {/* Action Buttons - Context-aware */}
        <div className="flex justify-end gap-3">
          {context === 'upload' ? (
            <>
              <Button variant="secondary" onClick={onClose}>
                Upload More
              </Button>
              <Button variant="ghost" onClick={onClose}>
                View Knowledge Base
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={updateIndex.isPending}
              >
                {updateIndex.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save & Close'
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={updateIndex.isPending}
              >
                {updateIndex.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default KnowledgeSummaryReview;
