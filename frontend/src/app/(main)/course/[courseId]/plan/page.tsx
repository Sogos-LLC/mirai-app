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
  CheckCircle2,
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
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useGetCourse } from '@/hooks/useCourses';
import { DocumentAnalysisCard } from '@/components/plan/DocumentAnalysisCard';
import { PlannedSectionCard } from '@/components/plan/PlannedSectionCard';

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
                {context.plan.documentAnalyses.map((doc, idx) => (
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
                {context.plan.plannedSections.map((section, idx) => (
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
