'use client';

import React from 'react';
import { Sparkles, Wand2, Loader2, Paperclip, CheckCircle, BookOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import WizardNavigation from '../WizardNavigation';

interface CourseNameStepProps {
  courseName: string;
  desiredOutcomes: string;
  onCourseNameChange: (name: string) => void;
  onDesiredOutcomesChange: (outcomes: string) => void;
  onGenerateOutcomes: () => void;
  onNext: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isGeneratingOutcomes?: boolean;
  // Knowledge sources (course-level)
  knowledgeFileCount?: number;
  processedSourcesCount?: number;
  onOpenKnowledgeModal?: () => void;
  // Team knowledge (shared across courses)
  teamKnowledgeCount?: number;
  teamKnowledgeTokens?: number;
  // Internal Data Only mode
  internalDataOnly?: boolean;
  onInternalDataOnlyChange?: (enabled: boolean) => void;
}

export default function CourseNameStep({
  courseName,
  desiredOutcomes,
  onCourseNameChange,
  onDesiredOutcomesChange,
  onGenerateOutcomes,
  onNext,
  onCancel,
  isLoading = false,
  isGeneratingOutcomes = false,
  knowledgeFileCount = 0,
  processedSourcesCount = 0,
  onOpenKnowledgeModal,
  teamKnowledgeCount = 0,
  teamKnowledgeTokens = 0,
  internalDataOnly = false,
  onInternalDataOnlyChange,
}: CourseNameStepProps) {
  const hasProcessedSources = processedSourcesCount > 0;
  const hasPendingFiles = knowledgeFileCount > 0;
  const hasTeamKnowledge = teamKnowledgeCount > 0;
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (courseName.trim().length > 0) {
      onNext();
    }
  };

  return (
    <Card>
      <CardContent className="py-8">
        <div className="max-w-xl mx-auto text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-primary-600" />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-primary mb-2">
            What would you like to teach?
          </h2>
          <p className="text-sm sm:text-base text-secondary mb-8">
            Enter a course name or topic. Our AI will help you refine it and generate
            engaging content.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Input
                type="text"
                placeholder="e.g., Introduction to Machine Learning, Leadership Skills for Managers"
                value={courseName}
                onChange={(e) => onCourseNameChange(e.target.value)}
                autoFocus
              />
              <p className="text-sm text-muted mt-2">
                Don&apos;t worry about getting it perfect - you can refine it in the next step.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-primary">
                  Desired Course Outcomes
                </label>
                <div className="flex items-center gap-2">
                  {onOpenKnowledgeModal && (
                    <button
                      type="button"
                      onClick={onOpenKnowledgeModal}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                        transition-colors ${
                          hasProcessedSources
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30'
                            : 'bg-surface border border-gray-300 dark:border-gray-600 text-secondary hover:bg-hover hover:text-primary'
                        }`}
                      title={hasProcessedSources ? 'View or add more knowledge sources' : 'Add knowledge sources to improve generation'}
                    >
                      {hasProcessedSources ? (
                        <CheckCircle className="w-3.5 h-3.5" />
                      ) : (
                        <Paperclip className="w-3.5 h-3.5" />
                      )}
                      {hasProcessedSources ? 'Knowledge Added' : 'Add Knowledge'}
                      {(hasProcessedSources || hasPendingFiles) && (
                        <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${
                          hasProcessedSources
                            ? 'bg-green-600 text-white'
                            : 'bg-primary-600 text-white'
                        }`}>
                          {hasProcessedSources ? processedSourcesCount : knowledgeFileCount}
                        </span>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onGenerateOutcomes}
                    disabled={!courseName.trim() || isGeneratingOutcomes}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                      bg-primary-50 text-primary-700 hover:bg-primary-100
                      dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors"
                    title="Generate outcomes from course name"
                  >
                    {isGeneratingOutcomes ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    {isGeneratingOutcomes ? 'Generating...' : 'Generate'}
                  </button>
                </div>
              </div>
              <textarea
                value={desiredOutcomes}
                onChange={(e) => onDesiredOutcomesChange(e.target.value)}
                placeholder="• Learners will be able to identify key concepts...
• Learners will understand how to apply...
• Learners will demonstrate proficiency in..."
                rows={5}
                className="w-full px-4 py-3 text-base border rounded-lg outline-none transition-all
                  bg-white dark:bg-dark-400
                  border-gray-300 dark:border-dark-border-input
                  text-gray-900 dark:text-dark-text
                  placeholder:text-gray-400 dark:placeholder:text-dark-text-muted
                  focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400
                  focus:border-transparent resize-none"
              />
              <p className="text-sm text-muted mt-2">
                These outcomes serve as the north star guiding all content generation.
              </p>
            </div>

            {/* Team Knowledge Available indicator */}
            {hasTeamKnowledge && (
              <div className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg text-left">
                <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <div className="text-sm text-indigo-800 dark:text-indigo-200">
                  <span className="font-semibold">Team Knowledge Available</span>
                  <span className="block mt-1 text-indigo-700 dark:text-indigo-300">
                    {teamKnowledgeCount} document{teamKnowledgeCount !== 1 ? 's' : ''} from your team&apos;s knowledge base
                    {teamKnowledgeTokens > 0 && ` (~${Math.round(teamKnowledgeTokens / 1000)}k tokens)`} will be used
                    to enhance course content.
                  </span>
                </div>
              </div>
            )}

            {/* Internal Data Only mode - show when any knowledge sources are present */}
            {(hasProcessedSources || hasTeamKnowledge) && onInternalDataOnlyChange && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-left">
                <input
                  type="checkbox"
                  id="internalDataOnly"
                  checked={internalDataOnly}
                  onChange={(e) => onInternalDataOnlyChange(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="internalDataOnly" className="text-sm text-amber-800 dark:text-amber-200">
                  <span className="font-semibold">Internal Data Only</span>
                  <span className="block mt-1 text-amber-700 dark:text-amber-300">
                    Generate course content exclusively from your {hasTeamKnowledge && hasProcessedSources ? 'team and uploaded documents' : hasTeamKnowledge ? 'team knowledge' : 'uploaded documents'}.
                    AI will not add external information or fill gaps — course size adapts to available content.
                  </span>
                </label>
              </div>
            )}
          </form>
        </div>

        <WizardNavigation
          onCancel={onCancel}
          onNext={onNext}
          canGoBack={false}
          canGoNext={courseName.trim().length > 0}
          isLoading={isLoading}
          nextLabel="Generate Title"
        />
      </CardContent>
    </Card>
  );
}
