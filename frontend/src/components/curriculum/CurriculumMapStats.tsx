'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import GroundingIndicator from '@/components/ui/GroundingIndicator';

export interface CurriculumMapStatsData {
  totalCells: number;
  coveredCells: number;
  coveragePercent: number;
  teachCount: number;
  assessCount: number;
  reinforceCount: number;
  uncoveredOutcomes: number;
  totalOutcomes: number;
}

export interface CurriculumMapStatsProps {
  /** Computed coverage statistics. Null when not yet computed. */
  stats: CurriculumMapStatsData | null;
  /** Aggregate grounding score from the curriculum map (0.0-1.0). */
  aggregateGroundingScore: number;
  /** Total number of contributing knowledge sources. */
  totalSourceCount: number;
  /** Whether the data is still loading. */
  isLoading?: boolean;
}

/**
 * Displays a 4-card stats grid showing grounding, coverage percentage,
 * intent breakdown, and outcomes covered.
 */
export function CurriculumMapStats({
  stats,
  aggregateGroundingScore,
  totalSourceCount,
}: CurriculumMapStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="py-4 text-center">
          <GroundingIndicator
            groundingScore={aggregateGroundingScore}
            sourceCount={totalSourceCount}
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
  );
}
