'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  PenTool,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import GroundingIndicator from '@/components/ui/GroundingIndicator';
import {
  useGetCurriculumMap,
  useGenerateCurriculumMap,
  useApproveCurriculumMap,
  hasErrors,
  hasWarnings,
} from '@/hooks/useCurriculumMap';
import {
  CurriculumMapStatus,
  CoverageIntent,
  CoverageLevel,
  IssueSeverity,
} from '@/gen/mirai/v1/curriculum_map_pb';

export default function CurriculumMapPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;

  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);

  const { data: mapResponse, isLoading, error } = useGetCurriculumMap(courseId);
  const generateMutation = useGenerateCurriculumMap();
  const approveMutation = useApproveCurriculumMap();

  const curriculumMap = mapResponse?.curriculumMap;

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-secondary">Loading curriculum map...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-primary mb-2">Error Loading Curriculum Map</h2>
            <p className="text-secondary mb-6">{error.message}</p>
            <Button variant="secondary" onClick={() => router.push(`/course/${courseId}/outline`)}>
              Back to Outline
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No curriculum map yet
  if (!curriculumMap) {
    return (
      <div className="min-h-screen bg-page">
        <div className="border-b bg-surface sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <button
              onClick={() => router.push(`/course/${courseId}/outline`)}
              className="flex items-center gap-2 text-secondary hover:text-primary transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Outline</span>
            </button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-12">
          <Card>
            <CardContent className="py-12 text-center">
              <h2 className="text-xl font-bold text-primary mb-4">Generate Curriculum Map</h2>
              <p className="text-secondary mb-6">
                The curriculum map shows how your course sections cover the desired learning outcomes.
                Generate it to validate coverage and sequencing before creating lessons.
              </p>
              <Button
                variant="primary"
                onClick={() => generateMutation.mutate({ courseId })}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Curriculum Map'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Status helpers
  const mapHasErrors = hasErrors(curriculumMap);
  const mapHasWarnings = hasWarnings(curriculumMap);
  const isApproved = curriculumMap.status === CurriculumMapStatus.APPROVED;
  const isStale = curriculumMap.status === CurriculumMapStatus.STALE;

  // Intent display helpers
  const intentDisplay = (intent: CoverageIntent) => {
    switch (intent) {
      case CoverageIntent.TEACH:
        return { label: 'Teach', icon: BookOpen, color: 'bg-green-500' };
      case CoverageIntent.ASSESS:
        return { label: 'Assess', icon: PenTool, color: 'bg-indigo-500' };
      case CoverageIntent.REINFORCE:
        return { label: 'Reinforce', icon: RotateCcw, color: 'bg-cyan-500' };
      default:
        return { label: '', icon: null, color: 'bg-gray-200 dark:bg-gray-700' };
    }
  };

  // Level display helpers
  const levelDisplay = (level: CoverageLevel) => {
    switch (level) {
      case CoverageLevel.INTRODUCE:
        return 'Intro';
      case CoverageLevel.DEVELOP:
        return 'Dev';
      case CoverageLevel.MASTER:
        return 'Master';
      default:
        return '';
    }
  };

  // Get unique outcomes from the first row's cells
  const outcomes = curriculumMap.rows?.[0]?.cells?.map(cell => ({
    id: cell.outcomeId,
    text: cell.outcomeText,
  })) || [];

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <div className="border-b bg-surface sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push(`/course/${courseId}/outline`)}
              className="flex items-center gap-2 text-secondary hover:text-primary transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Outline</span>
            </button>

            <div className="flex items-center gap-3">
              {isStale && (
                <span className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Outline Changed - Regenerate Required
                </span>
              )}
              {isApproved && (
                <span className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle2 className="w-3 h-3" />
                  Approved
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Grounding Summary */}
        <div className="mb-6">
          <GroundingIndicator
            groundingScore={curriculumMap.aggregateGroundingScore || 0}
            sourceCount={curriculumMap.totalSourceCount}
            variant="detailed"
          />
        </div>

        {/* Validation Issues */}
        {curriculumMap.issues && curriculumMap.issues.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {mapHasErrors ? (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                )}
                Validation Issues ({curriculumMap.issues.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {curriculumMap.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg text-sm ${
                      issue.severity === IssueSeverity.ERROR
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                        : issue.severity === IssueSeverity.WARNING
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
                        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                    }`}
                  >
                    <span className="font-medium capitalize">{issue.rule.replace(/_/g, ' ')}: </span>
                    {issue.message}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Coverage Matrix */}
        <Card>
          <CardHeader>
            <CardTitle>Coverage Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-secondary">Section</th>
                    {outcomes.map((outcome, idx) => (
                      <th
                        key={outcome.id}
                        className="p-3 font-medium text-secondary text-center min-w-[100px]"
                        title={outcome.text}
                      >
                        <div className="truncate max-w-[100px]">
                          Outcome {idx + 1}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {curriculumMap.rows?.map((row) => (
                    <tr key={row.sectionId} className="border-b hover:bg-hover">
                      <td className="p-3">
                        <div className="font-medium text-primary">{row.sectionTitle}</div>
                        <div className="text-xs text-muted">Section {row.sectionOrder}</div>
                      </td>
                      {row.cells?.map((cell) => {
                        const display = intentDisplay(cell.intent);
                        const level = levelDisplay(cell.level);
                        const isCovered = cell.intent !== CoverageIntent.UNSPECIFIED;

                        return (
                          <td key={cell.outcomeId} className="p-2 text-center">
                            {isCovered ? (
                              <div
                                className={`inline-flex flex-col items-center gap-1 px-2 py-1 rounded ${display.color} text-white text-xs`}
                                title={`${display.label} - ${level}`}
                              >
                                {display.icon && <display.icon className="w-3 h-3" />}
                                <span>{level}</span>
                              </div>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-green-500" />
                <span className="text-secondary">Teaching</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-indigo-500" />
                <span className="text-secondary">Assessment</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-cyan-500" />
                <span className="text-secondary">Reinforcement</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-end">
          <Button
            variant="ghost"
            onClick={() => generateMutation.mutate({ courseId, forceRegenerate: true })}
            disabled={generateMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            Regenerate
          </Button>

          {!isApproved && (
            <>
              {mapHasWarnings && !mapHasErrors && (
                <label className="flex items-center gap-2 text-sm text-secondary">
                  <input
                    type="checkbox"
                    checked={acknowledgeWarnings}
                    onChange={(e) => setAcknowledgeWarnings(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Acknowledge warnings
                </label>
              )}

              <Button
                variant="primary"
                onClick={() => approveMutation.mutate({ courseId, acknowledgeWarnings })}
                disabled={approveMutation.isPending || mapHasErrors || (mapHasWarnings && !acknowledgeWarnings)}
              >
                {approveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : (
                  'Approve Curriculum Map'
                )}
              </Button>
            </>
          )}

          {isApproved && (
            <Button
              variant="primary"
              onClick={() => router.push(`/course/${courseId}/outline`)}
            >
              Continue to Lesson Generation
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
