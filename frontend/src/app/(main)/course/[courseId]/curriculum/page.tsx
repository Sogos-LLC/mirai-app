'use client';

import React, { useState, useCallback, useMemo } from 'react';
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
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import GroundingIndicator from '@/components/ui/GroundingIndicator';
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
  IssueSeverity,
} from '@/gen/mirai/v1/curriculum_map_pb';
import type { CoverageCell } from '@/gen/mirai/v1/curriculum_map_pb';

// Intent cycle order for clicking cells: unspecified -> teach -> reinforce -> assess -> unspecified
const INTENT_CYCLE: CoverageIntent[] = [
  CoverageIntent.TEACH,
  CoverageIntent.REINFORCE,
  CoverageIntent.ASSESS,
  CoverageIntent.UNSPECIFIED,
];

// Level cycle order
const LEVEL_CYCLE: CoverageLevel[] = [
  CoverageLevel.INTRODUCE,
  CoverageLevel.DEVELOP,
  CoverageLevel.MASTER,
];

function intentLabel(intent: CoverageIntent): string {
  switch (intent) {
    case CoverageIntent.TEACH: return 'Teach';
    case CoverageIntent.ASSESS: return 'Assess';
    case CoverageIntent.REINFORCE: return 'Reinforce';
    default: return '';
  }
}

function intentColor(intent: CoverageIntent): string {
  switch (intent) {
    case CoverageIntent.TEACH: return 'bg-green-500';
    case CoverageIntent.ASSESS: return 'bg-indigo-500';
    case CoverageIntent.REINFORCE: return 'bg-cyan-500';
    default: return '';
  }
}

function intentIcon(intent: CoverageIntent) {
  switch (intent) {
    case CoverageIntent.TEACH: return BookOpen;
    case CoverageIntent.ASSESS: return PenTool;
    case CoverageIntent.REINFORCE: return RotateCcw;
    default: return null;
  }
}

function levelLabel(level: CoverageLevel): string {
  switch (level) {
    case CoverageLevel.INTRODUCE: return 'Intro';
    case CoverageLevel.DEVELOP: return 'Develop';
    case CoverageLevel.MASTER: return 'Master';
    default: return '';
  }
}

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
  const stats = useMemo(() => {
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

  // Handle cell click — cycle intent
  const handleCellClick = useCallback((sectionId: string, outcomeId: string, currentCell: CoverageCell) => {
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4 text-center">
              <GroundingIndicator
                groundingScore={curriculumMap.aggregateGroundingScore || 0}
                sourceCount={curriculumMap.totalSourceCount}
                variant="compact"
              />
            </CardContent>
          </Card>
          {stats && (
            <>
              <Card>
                <CardContent className="py-4 text-center">
                  <div className="text-2xl font-bold text-primary">{stats.coveragePercent}%</div>
                  <div className="text-xs text-muted">
                    {stats.coveredCells}/{stats.totalCells} cells covered
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <div className="flex justify-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      {stats.teachCount} Teach
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      {stats.assessCount} Assess
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-500" />
                      {stats.reinforceCount} Reinforce
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-1">Intent breakdown</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <div className={`text-2xl font-bold ${stats.uncoveredOutcomes > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {stats.totalOutcomes - stats.uncoveredOutcomes}/{stats.totalOutcomes}
                  </div>
                  <div className="text-xs text-muted">Outcomes covered</div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Validation Issues */}
        {curriculumMap.issues && curriculumMap.issues.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                {mapHasErrors ? (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                )}
                {curriculumMap.issues.length} Validation {curriculumMap.issues.length === 1 ? 'Issue' : 'Issues'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {curriculumMap.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`px-3 py-2 rounded text-xs ${
                      issue.severity === IssueSeverity.ERROR
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        : issue.severity === IssueSeverity.WARNING
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    }`}
                  >
                    <span className="font-semibold">{issue.rule.replace(/_/g, ' ')}: </span>
                    {issue.message}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Coverage Matrix</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-surface-elevated">
                    <th className="text-left px-4 py-3 font-medium text-secondary border-b sticky left-0 bg-surface-elevated z-10 min-w-[180px]">
                      Section
                    </th>
                    {outcomes.map((outcome, idx) => (
                      <th
                        key={outcome.id}
                        className="px-2 py-3 font-medium text-center border-b min-w-[90px]"
                        title={outcome.text}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs font-bold text-primary">O{idx + 1}</span>
                          <span className="text-[10px] text-muted truncate max-w-[80px]">
                            {outcome.text
                              ? outcome.text.length > 20
                                ? outcome.text.substring(0, 20) + '...'
                                : outcome.text
                              : ''}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {curriculumMap.rows?.map((row) => (
                    <tr key={row.sectionId} className="group">
                      <td className="px-4 py-3 border-b sticky left-0 bg-surface z-10 group-hover:bg-hover">
                        <div className="font-medium text-primary text-xs">{row.sectionTitle}</div>
                        <div className="text-[10px] text-muted">Section {row.sectionOrder}</div>
                      </td>
                      {row.cells?.map((cell) => {
                        const isCovered = cell.intent !== CoverageIntent.UNSPECIFIED;
                        const isEditing = editingCell?.sectionId === row.sectionId && editingCell?.outcomeId === cell.outcomeId;
                        const Icon = intentIcon(cell.intent);

                        return (
                          <td key={cell.outcomeId} className="px-1 py-1.5 border-b text-center group-hover:bg-hover relative">
                            {isEditing ? (
                              <CellEditor
                                currentIntent={cell.intent}
                                currentLevel={cell.level}
                                onSelect={(intent, level) => handleSetIntent(row.sectionId, cell.outcomeId, intent, level)}
                                onClose={() => setEditingCell(null)}
                              />
                            ) : (
                              <button
                                onClick={() => handleCellClick(row.sectionId, cell.outcomeId, cell)}
                                disabled={isApproved}
                                className={`w-full min-h-[44px] rounded-md transition-all ${
                                  isApproved ? 'cursor-default' : 'cursor-pointer hover:ring-2 hover:ring-indigo-300 dark:hover:ring-indigo-700'
                                } ${isCovered ? '' : 'hover:bg-active'}`}
                                title={isCovered
                                  ? `${intentLabel(cell.intent)} - ${levelLabel(cell.level)}`
                                  : isApproved ? 'Not covered' : 'Click to set coverage'
                                }
                              >
                                {isCovered ? (
                                  <div className={`inline-flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md ${intentColor(cell.intent)} text-white text-[11px] font-medium`}>
                                    {Icon && <Icon className="w-3 h-3" />}
                                    <span>{intentLabel(cell.intent)}</span>
                                    <span className="text-[9px] opacity-75">{levelLabel(cell.level)}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted text-xs">
                                    {isApproved ? '-' : '+'}
                                  </span>
                                )}
                              </button>
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
            <div className="px-4 py-3 border-t flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                <span className="text-secondary">Teach</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
                <span className="text-secondary">Assess</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
                <span className="text-secondary">Reinforce</span>
              </div>
              <span className="text-muted">|</span>
              <span className="text-muted">Levels: Intro, Develop, Master</span>
              {!isApproved && (
                <>
                  <span className="text-muted">|</span>
                  <span className="text-muted">Click a cell to edit</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-end items-center pb-8">
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
                <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
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

/**
 * Inline cell editor — shown when a coverage cell is clicked.
 * Allows picking intent (Teach/Assess/Reinforce/Clear) and level.
 */
function CellEditor({
  currentIntent,
  currentLevel,
  onSelect,
  onClose,
}: {
  currentIntent: CoverageIntent;
  currentLevel: CoverageLevel;
  onSelect: (intent: CoverageIntent, level: CoverageLevel) => void;
  onClose: () => void;
}) {
  const [selectedIntent, setSelectedIntent] = useState<CoverageIntent>(currentIntent);
  const [selectedLevel, setSelectedLevel] = useState<CoverageLevel>(
    currentLevel === CoverageLevel.UNSPECIFIED ? CoverageLevel.INTRODUCE : currentLevel
  );

  const intents = [
    { value: CoverageIntent.TEACH, label: 'Teach', color: 'bg-green-500 hover:bg-green-600' },
    { value: CoverageIntent.ASSESS, label: 'Assess', color: 'bg-indigo-500 hover:bg-indigo-600' },
    { value: CoverageIntent.REINFORCE, label: 'Reinforce', color: 'bg-cyan-500 hover:bg-cyan-600' },
  ];

  const levels = [
    { value: CoverageLevel.INTRODUCE, label: 'Intro' },
    { value: CoverageLevel.DEVELOP, label: 'Dev' },
    { value: CoverageLevel.MASTER, label: 'Master' },
  ];

  return (
    <div className="absolute z-20 top-0 left-1/2 -translate-x-1/2 bg-surface border rounded-lg shadow-lg p-2 min-w-[140px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted">Set coverage</span>
        <button onClick={onClose} className="p-0.5 hover:bg-hover rounded">
          <X className="w-3 h-3 text-muted" />
        </button>
      </div>
      <div className="flex flex-col gap-1 mb-1.5">
        {intents.map((i) => (
          <button
            key={i.value}
            onClick={() => setSelectedIntent(i.value)}
            className={`px-2 py-1 rounded text-[11px] font-medium text-white transition-all ${i.color} ${
              selectedIntent === i.value ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-60'
            }`}
          >
            {i.label}
          </button>
        ))}
      </div>
      {selectedIntent !== CoverageIntent.UNSPECIFIED && (
        <div className="flex gap-0.5 mb-1.5">
          {levels.map((l) => (
            <button
              key={l.value}
              onClick={() => setSelectedLevel(l.value)}
              className={`flex-1 px-1 py-0.5 rounded text-[10px] transition-all ${
                selectedLevel === l.value
                  ? 'bg-active text-primary font-semibold'
                  : 'bg-hover text-muted hover:text-secondary'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <button
          onClick={() => onSelect(selectedIntent, selectedLevel)}
          className="flex-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-medium"
        >
          Apply
        </button>
        <button
          onClick={() => onSelect(CoverageIntent.UNSPECIFIED, CoverageLevel.UNSPECIFIED)}
          className="px-2 py-1 rounded bg-hover hover:bg-active text-muted text-[10px]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
