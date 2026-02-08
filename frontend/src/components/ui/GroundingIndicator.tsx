'use client';

import React from 'react';
import { Info, AlertTriangle } from 'lucide-react';

export interface GroundingIndicatorProps {
  /** Grounding score from 0.0 to 1.0 */
  groundingScore: number;
  /** Tokens from course-specific knowledge */
  courseTokens?: number;
  /** Tokens from team knowledge sources */
  teamTokens?: number;
  /** Tokens from global knowledge sources */
  globalTokens?: number;
  /** Total tokens */
  totalTokens?: number;
  /** Display variant */
  variant?: 'compact' | 'detailed';
  /** Warning threshold (default 0.6) */
  warningThreshold?: number;
  /** Show source count */
  sourceCount?: number;
  /** Click handler for drill-down */
  onClick?: () => void;
}

/**
 * GroundingIndicator displays how much generated content is grounded in knowledge sources.
 * - Compact: Small badge with percentage and color
 * - Detailed: Breakdown with progress bar
 */
export default function GroundingIndicator({
  groundingScore,
  courseTokens = 0,
  teamTokens = 0,
  globalTokens = 0,
  totalTokens = 0,
  variant = 'compact',
  warningThreshold = 0.6,
  sourceCount,
  onClick,
}: GroundingIndicatorProps) {
  const percentage = Math.round(groundingScore * 100);
  const isLowGrounding = groundingScore < warningThreshold;

  // Determine level for styling
  const getLevel = () => {
    if (groundingScore >= 0.8) return 'high';
    if (groundingScore >= 0.6) return 'moderate';
    if (groundingScore >= 0.3) return 'low';
    return 'minimal';
  };

  const level = getLevel();

  // Colors based on grounding level
  const levelColors = {
    high: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    moderate: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    low: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    minimal: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  // Calculate token percentages for progress bar
  const groundedTokens = courseTokens + teamTokens + globalTokens;
  const ungroundedTokens = Math.max(0, totalTokens - groundedTokens);

  // Build tooltip text for native title attribute
  const tooltipText = [
    `Content Grounding: ${percentage}%`,
    groundingScore >= 0.6
      ? 'Content is well-grounded in your knowledge sources'
      : 'Some content may be AI-synthesized without direct source backing',
    totalTokens > 0 && courseTokens > 0 ? `Course sources: ~${courseTokens} tokens` : '',
    totalTokens > 0 && teamTokens > 0 ? `Team sources: ~${teamTokens} tokens` : '',
    totalTokens > 0 && globalTokens > 0 ? `Global sources: ~${globalTokens} tokens` : '',
    totalTokens > 0 && ungroundedTokens > 0 ? `AI synthesized: ~${ungroundedTokens} tokens` : '',
    sourceCount !== undefined && sourceCount > 0 ? `${sourceCount} knowledge source(s) used` : '',
  ].filter(Boolean).join('\n');

  if (variant === 'compact') {
    const isClickable = !!onClick;
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!isClickable}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${levelColors[level]} ${
          isClickable
            ? 'cursor-pointer hover:opacity-80 transition-opacity'
            : 'cursor-help'
        }`}
        title={isClickable ? `${tooltipText}\n\nClick to view sources` : tooltipText}
      >
        {isLowGrounding ? (
          <AlertTriangle size={14} />
        ) : (
          <Info size={14} />
        )}
        <span>{percentage}% grounded</span>
      </button>
    );
  }

  // Detailed variant with visual breakdown
  return (
    <div className="bg-surface border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary">Content Grounding</span>
          {isLowGrounding && (
            <span className="text-amber-500">
              <AlertTriangle size={16} />
            </span>
          )}
        </div>
        <span className={`text-lg font-bold ${groundingScore >= 0.6 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {percentage}%
        </span>
      </div>

      {/* Visual progress bar */}
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
        {courseTokens > 0 && totalTokens > 0 && (
          <div
            className="bg-indigo-500 h-full"
            style={{ width: `${(courseTokens / totalTokens) * 100}%` }}
            title={`Course: ${courseTokens} tokens`}
          />
        )}
        {teamTokens > 0 && totalTokens > 0 && (
          <div
            className="bg-blue-500 h-full"
            style={{ width: `${(teamTokens / totalTokens) * 100}%` }}
            title={`Team: ${teamTokens} tokens`}
          />
        )}
        {globalTokens > 0 && totalTokens > 0 && (
          <div
            className="bg-cyan-500 h-full"
            style={{ width: `${(globalTokens / totalTokens) * 100}%` }}
            title={`Global: ${globalTokens} tokens`}
          />
        )}
        {ungroundedTokens > 0 && totalTokens > 0 && (
          <div
            className="bg-amber-400 h-full"
            style={{ width: `${(ungroundedTokens / totalTokens) * 100}%` }}
            title={`Ungrounded: ${ungroundedTokens} tokens`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {courseTokens > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-indigo-500" />
            <span className="text-secondary">Course</span>
          </div>
        )}
        {teamTokens > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-secondary">Team</span>
          </div>
        )}
        {globalTokens > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-cyan-500" />
            <span className="text-secondary">Global</span>
          </div>
        )}
        {ungroundedTokens > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="text-secondary">AI Synthesized</span>
          </div>
        )}
      </div>

      {/* Source count */}
      {sourceCount !== undefined && sourceCount > 0 && (
        <div className="text-xs text-muted pt-1 border-t border-subtle">
          Based on {sourceCount} knowledge source{sourceCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Warning message for low grounding */}
      {isLowGrounding && (
        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
          Low grounding means some content may be AI-synthesized without direct backing from your knowledge sources. Consider adding more relevant documents.
        </div>
      )}
    </div>
  );
}
