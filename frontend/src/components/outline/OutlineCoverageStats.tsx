'use client';

import React from 'react';

export interface CoverageStatsData {
  totalCells: number;
  coveredCells: number;
  coveragePercent: number;
  teachCount: number;
  assessCount: number;
  reinforceCount: number;
  uncoveredOutcomes: number;
  totalOutcomes: number;
}

interface OutlineCoverageStatsProps {
  stats: CoverageStatsData | null;
  isGenerating: boolean;
}

/**
 * Compact horizontal stats row showing coverage metrics inline on the outline page.
 * Shows a loading skeleton when the curriculum map is being generated.
 */
export function OutlineCoverageStats({ stats, isGenerating }: OutlineCoverageStatsProps) {
  if (isGenerating) {
    return (
      <div className="flex flex-wrap items-center gap-4 py-3 px-4 bg-surface-elevated rounded-lg border animate-pulse">
        <div className="h-4 w-24 bg-hover rounded" />
        <div className="h-4 w-32 bg-hover rounded" />
        <div className="h-4 w-20 bg-hover rounded" />
      </div>
    );
  }

  if (!stats) return null;

  const coveredOutcomes = stats.totalOutcomes - stats.uncoveredOutcomes;
  const allOutcomesCovered = stats.uncoveredOutcomes === 0;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 px-4 bg-surface-elevated rounded-lg border text-sm">
      {/* Coverage % */}
      <div className="flex items-center gap-2">
        <span className="font-semibold text-primary">{stats.coveragePercent}%</span>
        <span className="text-muted">
          {stats.coveredCells}/{stats.totalCells} cells
        </span>
      </div>

      {/* Intent breakdown */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-secondary">{stats.teachCount} Teach</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className="text-secondary">{stats.assessCount} Assess</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-500" />
          <span className="text-secondary">{stats.reinforceCount} Reinforce</span>
        </span>
      </div>

      {/* Outcomes covered */}
      <div className="flex items-center gap-1">
        <span className={`font-semibold ${allOutcomesCovered ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {coveredOutcomes}/{stats.totalOutcomes}
        </span>
        <span className="text-muted">outcomes</span>
      </div>
    </div>
  );
}
