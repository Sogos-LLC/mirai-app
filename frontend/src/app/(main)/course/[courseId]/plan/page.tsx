'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMachine } from '@xstate/react';
import {
  FileText,
  BookOpen,
  ArrowLeft,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Search,
  Lightbulb,
} from 'lucide-react';
import {
  planReviewMachine,
  isPlanLoading,
  isPollingPlan,
} from '@/machines/planReviewMachine';
import { createPlanReviewActors } from '@/machines/planReviewActors';
import { createClient } from '@connectrpc/connect';
import { transport } from '@/lib/connect';
import { AIGenerationService } from '@/gen/mirai/v1/ai_generation_service_pb';
import type { DocumentAnalysis, PlannedSection } from '@/gen/mirai/v1/ai_generation_types_pb';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useGetCourse } from '@/hooks/useCourses';

export default function PlanReviewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = params.courseId as string;
  const initialJobId = searchParams.get('jobId');

  // Fetch course data for metadata header
  const courseQuery = useGetCourse(courseId);
  const course = courseQuery.data;

  // Create connect client for direct API calls
  const aiClient = useMemo(() => createClient(AIGenerationService, transport), []);

  // Create machine with provided actors
  const machineWithActors = useMemo(() => {
    const actors = createPlanReviewActors(aiClient);
    return planReviewMachine.provide({ actors });
  }, [aiClient]);

  // Initialize machine
  const [state, send] = useMachine(machineWithActors, {
    input: { courseId, initialJobId: initialJobId ?? undefined },
  });

  const context = state.context;
  const stateValue = state.value;
  const loading = isPlanLoading(stateValue);

  // Expanded state for document analyses
  const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set());
  // Expanded state for planned sections
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  // Expand all sections when plan loads
  useEffect(() => {
    if (context.plan?.plannedSections) {
      setExpandedSections(new Set(context.plan.plannedSections.map((_, i) => i)));
    }
  }, [context.plan]);

  // Handle approved state — redirect to outline page with job ID
  useEffect(() => {
    if (state.matches('approved')) {
      const url = context.outlineJobId
        ? `/course/${courseId}/outline?jobId=${context.outlineJobId}`
        : `/course/${courseId}/outline`;
      router.push(url);
    }
  }, [state, courseId, context.outlineJobId, router]);

  const toggleDoc = (index: number) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const totalLessons = context.plan?.plannedSections?.reduce(
    (acc, section) => acc + (section.lessons?.length ?? 0),
    0
  ) ?? 0;

  // Loading state
  if (state.matches('loading')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-secondary">Loading course plan...</p>
        </div>
      </div>
    );
  }

  // Polling state
  if (isPollingPlan(stateValue)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-6" />
            <h2 className="text-xl font-bold text-primary mb-2">Analyzing Documents</h2>
            <p className="text-secondary mb-4">{context.progressMessage}</p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${context.progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-muted mt-3">
              This may take a few minutes depending on document size.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (state.matches('error') || context.error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-primary mb-2">Something went wrong</h2>
            <p className="text-secondary mb-6">{context.error?.message || 'An error occurred'}</p>
            <div className="flex gap-4 justify-center">
              <Button variant="secondary" onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </Button>
              {context.error?.retryable && (
                <Button variant="primary" onClick={() => send({ type: 'RETRY' })}>
                  Try Again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main viewing state
  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <div className="border-b bg-surface sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 text-secondary hover:text-primary transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-4 py-6 sm:py-8">
        {/* Course Metadata Header */}
        {course && (
          <div className="mb-6 p-6 bg-surface rounded-lg border">
            <h1 className="text-2xl font-bold text-primary mb-2">
              {course.settings?.title || 'Untitled Course'}
            </h1>
            {course.settings?.desiredOutcome && (
              <p className="text-secondary">{course.settings.desiredOutcome}</p>
            )}
            {context.plan?.status === 'approved' && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Plan Approved
              </div>
            )}
          </div>
        )}

        {/* Document Analyses */}
        {context.plan?.documentAnalyses && context.plan.documentAnalyses.length > 0 && (
          <Card className="mb-6">
            <CardContent className="py-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-primary">Document Analysis</h2>
                  <p className="text-sm text-secondary">
                    {context.plan.documentAnalyses.length} document{context.plan.documentAnalyses.length !== 1 ? 's' : ''} analyzed
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {context.plan.documentAnalyses.map((doc: DocumentAnalysis, idx: number) => (
                  <DocumentAnalysisCard
                    key={doc.sourceId || idx}
                    doc={doc}
                    isExpanded={expandedDocs.has(idx)}
                    onToggle={() => toggleDoc(idx)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Planned Sections */}
        <Card>
          <CardContent className="py-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-primary">Planned Course Structure</h2>
                  <p className="text-sm text-secondary">
                    {context.plan?.plannedSections?.length ?? 0} sections, {totalLessons} lessons
                  </p>
                </div>
              </div>
            </div>

            {context.plan?.plannedSections && context.plan.plannedSections.length > 0 ? (
              <div className="border rounded-lg divide-y mb-6">
                {context.plan.plannedSections.map((section: PlannedSection, idx: number) => (
                  <PlannedSectionCard
                    key={idx}
                    section={section}
                    sectionIndex={idx}
                    isExpanded={expandedSections.has(idx)}
                    onToggle={() => toggleSection(idx)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-secondary">No planned sections available.</p>
              </div>
            )}

            {/* Info box */}
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg mb-6">
              <p className="text-sm text-indigo-800 dark:text-indigo-200">
                <strong>Review the course plan carefully.</strong> Approving this plan will guide the AI to generate
                an outline and lessons grounded in your source material. The search terms listed will be used
                to retrieve relevant content from your knowledge sources.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
                className="w-full sm:w-auto min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => send({ type: 'APPROVE_PLAN' })}
                disabled={loading || !context.plan || context.plan.status === 'approved'}
                className="w-full sm:w-auto min-h-[44px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : context.plan?.status === 'approved' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Already Approved
                  </>
                ) : (
                  'Approve Plan & Generate Outline'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function DocumentAnalysisCard({
  doc,
  isExpanded,
  onToggle,
}: {
  doc: DocumentAnalysis;
  isExpanded: boolean;
  onToggle: () => void;
}) {
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

function PlannedSectionCard({
  section,
  sectionIndex,
  isExpanded,
  onToggle,
}: {
  section: PlannedSection;
  sectionIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
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
