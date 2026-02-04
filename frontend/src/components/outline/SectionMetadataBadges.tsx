'use client';

import React from 'react';
import { BookOpen, PenTool, RotateCcw, Lightbulb, GraduationCap, Award } from 'lucide-react';
import { SectionLevel, SectionIntent, SectionEmphasis } from '@/gen/mirai/v1/ai_generation_types_pb';
import GroundingIndicator from '@/components/ui/GroundingIndicator';

export interface SectionMetadataBadgesProps {
  /** Learning level for this section */
  level?: SectionLevel;
  /** Primary intent of the section */
  intent?: SectionIntent;
  /** Relative importance */
  emphasis?: SectionEmphasis;
  /** Grounding score from knowledge sources (0.0 - 1.0) */
  groundingScore?: number;
  /** IDs of contributing knowledge chunks */
  contributingChunkIds?: string[];
  /** Compact mode shows fewer badges */
  compact?: boolean;
  /** Handler for viewing source evidence */
  onShowSources?: () => void;
}

/**
 * Displays section metadata as visual badges.
 * Shows learning level, teaching intent, and grounding status.
 */
export default function SectionMetadataBadges({
  level,
  intent,
  emphasis,
  groundingScore,
  contributingChunkIds,
  compact = false,
  onShowSources,
}: SectionMetadataBadgesProps) {
  // Level badge configuration
  const levelConfig: Record<SectionLevel, { label: string; icon: React.ReactNode; className: string }> = {
    [SectionLevel.UNSPECIFIED]: { label: '', icon: null, className: '' },
    [SectionLevel.INTRODUCE]: {
      label: 'Intro',
      icon: <Lightbulb className="w-3 h-3" />,
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    },
    [SectionLevel.DEVELOP]: {
      label: 'Develop',
      icon: <GraduationCap className="w-3 h-3" />,
      className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    },
    [SectionLevel.MASTER]: {
      label: 'Master',
      icon: <Award className="w-3 h-3" />,
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    },
  };

  // Intent badge configuration
  const intentConfig: Record<SectionIntent, { label: string; icon: React.ReactNode; className: string }> = {
    [SectionIntent.UNSPECIFIED]: { label: '', icon: null, className: '' },
    [SectionIntent.TEACH]: {
      label: 'Teaching',
      icon: <BookOpen className="w-3 h-3" />,
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    [SectionIntent.ASSESS]: {
      label: 'Assessment',
      icon: <PenTool className="w-3 h-3" />,
      className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    },
    [SectionIntent.REINFORCE]: {
      label: 'Practice',
      icon: <RotateCcw className="w-3 h-3" />,
      className: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    },
  };

  // Emphasis indicator (dots or bar)
  const emphasisLevel = emphasis ?? SectionEmphasis.UNSPECIFIED;
  const emphasisDots = emphasisLevel === SectionEmphasis.HIGH ? 3 :
                       emphasisLevel === SectionEmphasis.MEDIUM ? 2 :
                       emphasisLevel === SectionEmphasis.LOW ? 1 : 0;

  const levelInfo = level !== undefined ? levelConfig[level] : null;
  const intentInfo = intent !== undefined ? intentConfig[intent] : null;

  // Don't render if no meaningful metadata
  const hasLevel = levelInfo && levelInfo.label;
  const hasIntent = intentInfo && intentInfo.label;
  const hasGrounding = groundingScore !== undefined && groundingScore > 0;
  const hasSources = contributingChunkIds && contributingChunkIds.length > 0;

  if (!hasLevel && !hasIntent && !hasGrounding && !hasSources) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Level badge */}
      {hasLevel && (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${levelInfo.className}`}
          title={`Learning Level: ${levelInfo.label}`}
        >
          {levelInfo.icon}
          {!compact && <span>{levelInfo.label}</span>}
        </span>
      )}

      {/* Intent badge */}
      {hasIntent && (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${intentInfo.className}`}
          title={`Section Intent: ${intentInfo.label}`}
        >
          {intentInfo.icon}
          {!compact && <span>{intentInfo.label}</span>}
        </span>
      )}

      {/* Emphasis indicator (subtle dots) */}
      {emphasisDots > 0 && !compact && (
        <span
          className="flex items-center gap-0.5 px-1.5 py-0.5"
          title={`Emphasis: ${emphasisLevel === SectionEmphasis.HIGH ? 'High' : emphasisLevel === SectionEmphasis.MEDIUM ? 'Medium' : 'Low'}`}
        >
          {[...Array(3)].map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${
                i < emphasisDots
                  ? 'bg-indigo-500 dark:bg-indigo-400'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </span>
      )}

      {/* Grounding indicator */}
      {hasGrounding && (
        <GroundingIndicator
          groundingScore={groundingScore}
          variant="compact"
          sourceCount={hasSources ? contributingChunkIds.length : undefined}
          onClick={hasSources ? onShowSources : undefined}
        />
      )}
    </div>
  );
}
