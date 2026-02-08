'use client';

import React from 'react';
import { BookOpen, Globe, Sparkles, CheckCircle2, Info } from 'lucide-react';
import { SourceType } from '@/gen/mirai/v1/ai_generation_types_pb';
import type { LessonComponent, LessonProvenance } from '@/gen/mirai/v1/ai_generation_types_pb';
import { getSourceTypeKey } from './SourceModeOverlay';

interface SourceSummaryBarProps {
  provenance: LessonProvenance;
  components: LessonComponent[];
  effectiveGroundingScore?: number;
}

export function SourceSummaryBar({ provenance, components, effectiveGroundingScore }: SourceSummaryBarProps) {
  // Count components by dominant source type, separating validated MODEL components
  let internalCount = 0;
  let webCount = 0;
  let modelCount = 0;
  let validatedCount = 0;

  for (const comp of components) {
    const key = getSourceTypeKey(comp.provenance?.dominantSourceType, comp.validated);
    if (key === 'internal') internalCount++;
    else if (key === 'web') webCount++;
    else if (key === 'validated') validatedCount++;
    else modelCount++;
  }

  const total = internalCount + webCount + modelCount + validatedCount;
  const internalPct = total > 0 ? (internalCount / total) * 100 : 0;
  const webPct = total > 0 ? (webCount / total) * 100 : 0;
  const validatedPct = total > 0 ? (validatedCount / total) * 100 : 0;
  const modelPct = total > 0 ? (modelCount / total) * 100 : 0;

  const groundingScore = effectiveGroundingScore ?? provenance.groundingScore ?? 0;
  const sourceCount = provenance.sourceCount ?? 0;

  return (
    <div className="mb-4 p-3 rounded-lg border border-subtle bg-hover">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-muted" />
          <span className="text-xs font-medium text-primary">Source Distribution</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span>{sourceCount} source{sourceCount !== 1 ? 's' : ''}</span>
          <span className={`px-1.5 py-0.5 rounded-full font-medium ${
            groundingScore >= 0.6
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : groundingScore >= 0.3
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {Math.round(groundingScore * 100)}% grounded
          </span>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="h-2 rounded-full overflow-hidden flex bg-surface">
        {internalPct > 0 && (
          <div
            className="h-full transition-all"
            style={{
              width: `${internalPct}%`,
              backgroundColor: 'var(--source-internal-border)',
            }}
          />
        )}
        {webPct > 0 && (
          <div
            className="h-full transition-all"
            style={{
              width: `${webPct}%`,
              backgroundColor: 'var(--source-web-border)',
            }}
          />
        )}
        {validatedPct > 0 && (
          <div
            className="h-full transition-all"
            style={{
              width: `${validatedPct}%`,
              backgroundColor: 'var(--source-validated-border)',
            }}
          />
        )}
        {modelPct > 0 && (
          <div
            className="h-full transition-all"
            style={{
              width: `${modelPct}%`,
              backgroundColor: 'var(--source-model-border)',
            }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[10px] text-secondary">
        {internalCount > 0 && (
          <div className="flex items-center gap-1">
            <BookOpen className="w-3 h-3" style={{ color: 'var(--source-internal-border)' }} />
            <span>Internal ({internalCount})</span>
          </div>
        )}
        {webCount > 0 && (
          <div className="flex items-center gap-1">
            <Globe className="w-3 h-3" style={{ color: 'var(--source-web-border)' }} />
            <span>Web ({webCount})</span>
          </div>
        )}
        {validatedCount > 0 && (
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--source-validated-border)' }} />
            <span>Validated ({validatedCount})</span>
          </div>
        )}
        {modelCount > 0 && (
          <div className="flex items-center gap-1">
            <Sparkles className="w-3 h-3" style={{ color: 'var(--source-model-border)' }} />
            <span>AI ({modelCount})</span>
          </div>
        )}
      </div>
    </div>
  );
}
