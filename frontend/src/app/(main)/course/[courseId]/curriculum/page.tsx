'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { CurriculumMapStats } from '@/components/curriculum/CurriculumMapStats';
import type { CurriculumMapStatsData } from '@/components/curriculum/CurriculumMapStats';
import { ValidationIssuesList } from '@/components/curriculum/ValidationIssuesList';
import { CoverageMatrix } from '@/components/curriculum/CoverageMatrix';
import { CurriculumMapActions } from '@/components/curriculum/CurriculumMapActions';
import {
  useGetCurriculumMap,
  useGenerateCurriculumMap,
  useApproveCurriculumMap,
  useUpdateCoverageCell,
  hasErrors,
  hasWarnings,
} from '@/hooks/useCurriculumMap';
import {
  CurriculumMapStatus,
  CoverageIntent,
  CoverageLevel,
} from '@/gen/mirai/v1/curriculum_map_pb';
import type { CoverageCell } from '@/gen/mirai/v1/curriculum_map_pb';

export default function CurriculumMapPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;

  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);
  const [expandedOutcomes, setExpandedOutcomes] = useState(false);
  const [editingCell, setEditingCell] = useState<{ sectionId: string; outcomeId: string } | null>(null);

  const { data: mapResponse, isLoading, error } = useGetCurriculumMap(courseId);
  const generateMutation = useGenerateCurriculumMap();
  const approveMutation = useApproveCurriculumMap();
  const updateCellMutation = useUpdateCoverageCell();

  const curriculumMap = mapResponse?.curriculumMap;

  // Compute coverage statistics
  const stats = useMemo<CurriculumMapStatsData | null>(() => {
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
  }, [curriculumMap]);

  // Handle cell click -- open editor
  const handleCellClick = useCallback((sectionId: string, outcomeId: string, _currentCell: CoverageCell) => {
    if (curriculumMap?.status === CurriculumMapStatus.APPROVED) return;
    setEditingCell({ sectionId, outcomeId });
  }, [curriculumMap?.status]);

  // Handle intent selection from the cell editor
  const handleSetIntent = useCallback((sectionId: string, outcomeId: string, intent: CoverageIntent, level: CoverageLevel) => {
    updateCellMutation.mutate({
      courseId,
      sectionId,
      outcomeId,
      intent,
      level,
      emphasis: intent === CoverageIntent.UNSPECIFIED ? 0 : 50,
    });
    setEditingCell(null);
  }, [courseId, updateCellMutation]);

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
          <div className="max-w-7xl mx-auto px-4 py-4">
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

  const mapHasErrors = hasErrors(curriculumMap);
  const mapHasWarnings = hasWarnings(curriculumMap);
  const isApproved = curriculumMap.status === CurriculumMapStatus.APPROVED;
  const isStale = curriculumMap.status === CurriculumMapStatus.STALE;

  const outcomes = curriculumMap.rows?.[0]?.cells?.map(cell => ({
    id: cell.outcomeId,
    text: cell.outcomeText,
  })) || [];

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <div className="border-b bg-surface sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/course/${courseId}/outline`)}
                className="flex items-center gap-2 text-secondary hover:text-primary transition-colors min-h-[44px]"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Back to Outline</span>
              </button>
              <div>
                <h1 className="text-lg font-semibold text-primary">Curriculum Map</h1>
                <p className="text-xs text-muted">
                  Click cells to adjust coverage mappings
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isStale && (
                <span className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Stale - Regenerate
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

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Row */}
        <CurriculumMapStats
          stats={stats}
          aggregateGroundingScore={curriculumMap.aggregateGroundingScore || 0}
          totalSourceCount={curriculumMap.totalSourceCount}
        />

        {/* Validation Issues */}
        {curriculumMap.issues && curriculumMap.issues.length > 0 && (
          <ValidationIssuesList
            issues={curriculumMap.issues}
            hasErrors={mapHasErrors}
            hasWarnings={mapHasWarnings}
          />
        )}

        {/* Learning Outcomes (collapsible) */}
        {outcomes.length > 0 && (
          <Card>
            <button
              className="w-full text-left"
              onClick={() => setExpandedOutcomes(!expandedOutcomes)}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Learning Outcomes ({outcomes.length})</span>
                  {expandedOutcomes ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </CardTitle>
              </CardHeader>
            </button>
            {expandedOutcomes && (
              <CardContent>
                <div className="space-y-2">
                  {outcomes.map((outcome, idx) => (
                    <div key={outcome.id} className="flex items-start gap-2 text-sm">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="text-secondary pt-1">{outcome.text || `Outcome ${idx + 1}`}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Coverage Matrix */}
        <CoverageMatrix
          curriculumMap={curriculumMap}
          editingCell={editingCell}
          isApproved={isApproved}
          onCellClick={handleCellClick}
          onCellEdit={handleSetIntent}
          onCellEditorClose={() => setEditingCell(null)}
        />

        {/* Actions */}
        <CurriculumMapActions
          isApproved={isApproved}
          mapHasErrors={mapHasErrors}
          mapHasWarnings={mapHasWarnings}
          acknowledgeWarnings={acknowledgeWarnings}
          isRegenerating={generateMutation.isPending}
          isApproving={approveMutation.isPending}
          onRegenerate={() => generateMutation.mutate({ courseId, forceRegenerate: true })}
          onAcknowledgeWarningsChange={setAcknowledgeWarnings}
          onApprove={() => approveMutation.mutate({ courseId, acknowledgeWarnings })}
          onContinue={() => router.push(`/course/${courseId}/outline`)}
        />
      </div>
    </div>
  );
}
