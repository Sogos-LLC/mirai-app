'use client';

import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMachine } from '@xstate/react';
import {
  ClipboardList,
  RefreshCw,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Copy,
  CheckCheck,
} from 'lucide-react';
import {
  outlineReviewMachine,
  isLoading,
  isPollingOutline,
  isPollingLessons,
} from '@/machines/outlineReviewMachine';
import { createOutlineReviewActors } from '@/machines/outlineReviewActors';
import {
  useGenerateAllLessons,
  useGenerateCourseOutline,
} from '@/hooks/useAIGeneration';
import { createClient } from '@connectrpc/connect';
import { transport } from '@/lib/connect';
import type { CourseOutline } from '@/gen/mirai/v1/ai_generation_types_pb';
import { AIGenerationService } from '@/gen/mirai/v1/ai_generation_service_pb';
import { CoverageIntent } from '@/gen/mirai/v1/curriculum_map_pb';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useIsTouchDevice } from '@/hooks/useBreakpoint';
import { useGetCourse } from '@/hooks/useCourses';
import { useGetCurriculumMap, useGenerateCurriculumMap, useApproveCurriculumMap } from '@/hooks/useCurriculumMap';
import type { Course } from '@/gen/mirai/v1/course_pb';
import GroundingIndicator from '@/components/ui/GroundingIndicator';
import SourceEvidencePanel, { type SourceChunk } from '@/components/ui/SourceEvidencePanel';
import { OutlineSectionCard } from '@/components/outline/OutlineSectionCard';
import { OutlineCoverageStats } from '@/components/outline/OutlineCoverageStats';
import type { CoverageStatsData } from '@/components/outline/OutlineCoverageStats';
import type { SectionFeedbackData } from '@/components/outline/SectionFeedbackControls';

export default function OutlineReviewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = params.courseId as string;
  const initialJobId = searchParams.get('jobId');
  const isTouch = useIsTouchDevice();

  console.log('[DEBUG-COURSEID] OutlinePage: courseId from URL params:', courseId, 'initialJobId:', initialJobId);

  // Copy success state
  const [copied, setCopied] = useState(false);
  // Section evidence panel state
  const [sectionEvidenceIndex, setSectionEvidenceIndex] = useState<number | null>(null);

  // Fetch course data for metadata header
  const courseQuery = useGetCourse(courseId);
  const course = courseQuery.data;

  // Curriculum map hooks
  const curriculumMapQuery = useGetCurriculumMap(courseId);
  const generateCurriculumMap = useGenerateCurriculumMap();
  const approveCurriculumMap = useApproveCurriculumMap();

  // API hooks
  const generateAllLessons = useGenerateAllLessons();
  const generateCourseOutline = useGenerateCourseOutline();

  // Create connect client for direct API calls
  const aiClient = useMemo(() => createClient(AIGenerationService, transport), []);

  // Create machine with provided actors
  const machineWithActors = useMemo(() => {
    const actors = createOutlineReviewActors(
      aiClient,
      generateCourseOutline,
      generateAllLessons,
      approveCurriculumMap,
    );
    return outlineReviewMachine.provide({ actors });
  }, [aiClient, generateAllLessons, generateCourseOutline, approveCurriculumMap]);

  // Initialize machine with courseId and optional jobId from URL
  const [state, send] = useMachine(machineWithActors, {
    input: { courseId, initialJobId: initialJobId ?? undefined },
  });

  const context = state.context;
  const stateValue = state.value;
  const loading = isLoading(stateValue);

  // Expanded sections for outline display
  const [expandedSections, setExpandedSections] = React.useState<Set<number>>(new Set());

  // Expand all sections when outline loads
  useEffect(() => {
    if (context.outline?.sections) {
      setExpandedSections(new Set(context.outline.sections.map((_, i) => i)));
    }
  }, [context.outline]);

  // Handle completion states
  useEffect(() => {
    if (state.matches('complete')) {
      router.push(`/preview/${courseId}`);
    } else if (state.matches('backgroundGeneration')) {
      router.push('/dashboard');
    }
  }, [state, courseId, router]);

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const totalLessons = context.outline?.sections?.reduce(
    (acc, section) => acc + (section.lessons?.length ?? 0),
    0
  ) ?? 0;

  // Aggregate learning objectives from all lessons
  const learningOutcomes = useMemo(() => {
    if (!context.outline?.sections) return [];
    const allObjectives = context.outline.sections.flatMap((section) =>
      section.lessons?.flatMap((lesson) => lesson.learningObjectives || []) || []
    );
    return [...new Set(allObjectives)].slice(0, 5);
  }, [context.outline]);

  // Auto-generate curriculum map when outline is loaded but no map exists
  const mapGenerationTriggered = useRef(false);
  useEffect(() => {
    if (
      state.matches('viewing') &&
      !curriculumMapQuery.isLoading &&
      !curriculumMapQuery.data?.curriculumMap &&
      !generateCurriculumMap.isPending &&
      !mapGenerationTriggered.current
    ) {
      mapGenerationTriggered.current = true;
      generateCurriculumMap.mutate({ courseId });
    }
  }, [state, curriculumMapQuery.isLoading, curriculumMapQuery.data, generateCurriculumMap, courseId]);

  // Compute coverage stats from curriculum map
  const coverageStats = useMemo<CoverageStatsData | null>(() => {
    const curriculumMap = curriculumMapQuery.data?.curriculumMap;
    if (!curriculumMap?.rows?.length) return null;
    const outcomes = curriculumMap.rows[0]?.cells || [];
    const totalCells = curriculumMap.rows.length * outcomes.length;
    let coveredCells = 0;
    let teachCount = 0;
    let assessCount = 0;
    let reinforceCount = 0;
    const outcomeCoverage = new Map<string, number>();

    for (const row of curriculumMap.rows) {
      for (const cell of row.cells || []) {
        if (cell.intent !== CoverageIntent.UNSPECIFIED) {
          coveredCells++;
          outcomeCoverage.set(cell.outcomeId, (outcomeCoverage.get(cell.outcomeId) || 0) + 1);
        }
        if (cell.intent === CoverageIntent.TEACH) teachCount++;
        if (cell.intent === CoverageIntent.ASSESS) assessCount++;
        if (cell.intent === CoverageIntent.REINFORCE) reinforceCount++;
      }
    }
    const uncoveredOutcomes = outcomes.filter(c => !outcomeCoverage.has(c.outcomeId)).length;
    return {
      totalCells,
      coveredCells,
      coveragePercent: totalCells > 0 ? Math.round((coveredCells / totalCells) * 100) : 0,
      teachCount,
      assessCount,
      reinforceCount,
      uncoveredOutcomes,
      totalOutcomes: outcomes.length,
    };
  }, [curriculumMapQuery.data]);

  // Calculate aggregate grounding metrics from all sections
  const aggregateGrounding = useMemo(() => {
    if (!context.outline?.sections || context.outline.sections.length === 0) {
      return null;
    }

    let totalScore = 0;
    let totalChunks = 0;
    const uniqueSources = new Set<string>();

    for (const section of context.outline.sections) {
      if (section.groundingScore) {
        totalScore += section.groundingScore;
      }
      if (section.contributingChunkIds) {
        totalChunks += section.contributingChunkIds.length;
        section.contributingChunkIds.forEach((chunkId) => {
          uniqueSources.add(chunkId.split('-')[0] || chunkId);
        });
      }
    }

    const avgScore = totalScore / context.outline.sections.length;

    if (avgScore === 0 && totalChunks === 0) {
      return null;
    }

    return {
      groundingScore: avgScore,
      totalChunks,
      sourceCount: Math.min(uniqueSources.size, totalChunks),
    };
  }, [context.outline]);

  // Convert learning outcomes to selectable format for feedback controls
  const availableOutcomesForFeedback = useMemo(() => {
    return learningOutcomes.map((outcome, idx) => ({
      id: `outcome-${idx}`,
      text: outcome,
    }));
  }, [learningOutcomes]);

  // Get section source evidence data
  const getSectionSourceEvidence = (sectionIndex: number): SourceChunk[] => {
    const section = context.outline?.sections?.[sectionIndex];
    if (!section?.contributingChunkIds) return [];

    return section.contributingChunkIds.map((chunkId, idx) => ({
      chunkId,
      sourceId: chunkId.split('-')[0] || chunkId,
      sourceName: `Source ${idx + 1}`,
      excerpt: 'Knowledge source chunk contributed to this section.',
      similarityScore: section.groundingScore || 0.7,
      scope: 'course' as const,
    }));
  };

  // Handle section feedback save
  const handleSaveSectionFeedback = (sectionIndex: number, data: SectionFeedbackData) => {
    send({
      type: 'UPDATE_SECTION_METADATA',
      sectionIndex,
      level: data.level,
      intent: data.intent,
      emphasis: data.emphasis,
      mappedOutcomeIds: data.mappedOutcomeIds,
    });
  };

  // Build outline text for clipboard
  const buildOutlineText = (
    courseData: Course,
    outline: CourseOutline
  ): { plain: string; html: string } => {
    const title = courseData.settings?.title || 'Course Outline';
    const description = courseData.settings?.desiredOutcome || '';

    let plain = `${title}\n${'='.repeat(title.length)}\n\n`;
    if (description) plain += `${description}\n\n`;

    let html = `<h1>${title}</h1>`;
    if (description) html += `<p>${description}</p>`;

    outline.sections?.forEach((section, i) => {
      plain += `${i + 1}. ${section.title}\n`;
      html += `<h2>${i + 1}. ${section.title}</h2>`;

      if (section.description) {
        plain += `   ${section.description}\n`;
        html += `<p>${section.description}</p>`;
      }

      section.lessons?.forEach((lesson, j) => {
        plain += `   ${i + 1}.${j + 1} ${lesson.title}\n`;
        html += `<h3>${i + 1}.${j + 1} ${lesson.title}</h3>`;

        if (lesson.description) {
          plain += `      ${lesson.description}\n`;
          html += `<p>${lesson.description}</p>`;
        }
      });
      plain += '\n';
    });

    return { plain, html };
  };

  // Copy outline to clipboard
  const handleCopyOutline = async () => {
    if (!context.outline || !course) return;

    const content = buildOutlineText(course, context.outline);

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([content.html], { type: 'text/html' }),
          'text/plain': new Blob([content.plain], { type: 'text/plain' }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await navigator.clipboard.writeText(content.plain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Loading state
  if (state.matches('loading')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-secondary">Loading outline...</p>
        </div>
      </div>
    );
  }

  // Polling outline state
  if (isPollingOutline(stateValue)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-6" />
            <h2 className="text-xl font-bold text-primary mb-2">Generating Outline</h2>
            <p className="text-secondary mb-4">{context.progressMessage}</p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${context.progressPercent}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Polling lessons state
  if (isPollingLessons(stateValue)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-10 h-10 text-indigo-600 dark:text-indigo-400 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-primary mb-2">
              Generating your lessons...
            </h2>
            <p className="text-secondary mb-4">
              Creating {totalLessons} lessons based on your outline.
              This typically takes 5-7 minutes.
            </p>
            <p className="text-sm text-secondary mb-4">{context.progressMessage}</p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-6">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${context.progressPercent}%` }}
              />
            </div>
            <button
              onClick={() => send({ type: 'DISMISS_LESSON_GENERATION' })}
              className="text-sm text-muted hover:text-secondary transition-colors"
            >
              Notify me instead
            </button>
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

  // Main viewing state - show outline
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
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-primary mb-2">
                  {course.settings?.title || 'Untitled Course'}
                </h1>
                {course.settings?.desiredOutcome && (
                  <p className="text-secondary">
                    {course.settings.desiredOutcome}
                  </p>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyOutline}
                disabled={!context.outline}
                className="w-full sm:w-auto min-h-[44px] flex-shrink-0"
              >
                {copied ? (
                  <>
                    <CheckCheck className="w-4 h-4 mr-2 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Outline
                  </>
                )}
              </Button>
            </div>

            {/* Aggregate Grounding Indicator */}
            {aggregateGrounding && (
              <div className="pt-4 border-t">
                <GroundingIndicator
                  groundingScore={aggregateGrounding.groundingScore}
                  variant="detailed"
                  sourceCount={aggregateGrounding.sourceCount}
                />
              </div>
            )}

            {learningOutcomes.length > 0 && (
              <div className="pt-4 border-t">
                <h3 className="text-sm font-semibold text-primary mb-2">
                  Learning Outcomes
                </h3>
                <ul className="text-sm text-secondary space-y-1">
                  {learningOutcomes.map((outcome, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-indigo-600 dark:text-indigo-400">•</span>
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <Card>
          <CardContent className="py-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold text-primary">
                    Review Your Course Outline
                  </h2>
                  <p className="text-sm sm:text-base text-secondary">
                    {context.outline?.sections?.length ?? 0} sections • {totalLessons} lessons
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => send({ type: 'REGENERATE_OUTLINE' })}
                disabled={loading}
                className="w-full sm:w-auto min-h-[44px]"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
            </div>

            {/* Outline */}
            {context.outline ? (
              <div className="border rounded-lg divide-y mb-6">
                {context.outline.sections?.map((section, sectionIndex) => (
                  <OutlineSectionCard
                    key={sectionIndex}
                    section={section}
                    sectionIndex={sectionIndex}
                    isExpanded={expandedSections.has(sectionIndex)}
                    isTouch={isTouch}
                    availableOutcomes={availableOutcomesForFeedback}
                    onToggle={() => toggleSection(sectionIndex)}
                    onUpdateSectionTitle={(idx, title) => send({ type: 'UPDATE_SECTION_TITLE', sectionIndex: idx, title })}
                    onUpdateLesson={(sIdx, lIdx, title, description) => send({ type: 'UPDATE_LESSON', sectionIndex: sIdx, lessonIndex: lIdx, title, description })}
                    onSaveSectionFeedback={handleSaveSectionFeedback}
                    onShowSectionSources={(idx) => setSectionEvidenceIndex(idx)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-secondary">No outline available.</p>
              </div>
            )}

            {/* Curriculum Coverage Stats */}
            <div className="mb-6">
              <OutlineCoverageStats
                stats={coverageStats}
                isGenerating={generateCurriculumMap.isPending || curriculumMapQuery.isLoading}
              />
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
                onClick={() => send({ type: 'APPROVE_OUTLINE' })}
                disabled={loading || !context.outline}
                className="w-full sm:w-auto min-h-[44px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Generate Lessons'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section Source Evidence Panel */}
      {sectionEvidenceIndex !== null && context.outline?.sections?.[sectionEvidenceIndex] && (
        <SourceEvidencePanel
          chunks={getSectionSourceEvidence(sectionEvidenceIndex)}
          groundingScore={context.outline.sections[sectionEvidenceIndex].groundingScore}
          title={`Sources: ${context.outline.sections[sectionEvidenceIndex].title || `Section ${sectionEvidenceIndex + 1}`}`}
          isOpen={true}
          onClose={() => setSectionEvidenceIndex(null)}
        />
      )}
    </div>
  );
}
