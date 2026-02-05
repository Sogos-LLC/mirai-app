'use client';

import React from 'react';
import {
  X,
  Shield,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import type { LessonProvenance, LessonComponent } from '@/gen/mirai/v1/ai_generation_types_pb';

interface ProvenancePanelProps {
  provenance: LessonProvenance;
  components: LessonComponent[];
  isOpen: boolean;
  onToggle: () => void;
}

/** Grounding score badge button shown in the lesson card header. */
export function ProvenanceBadge({
  provenance,
  isOpen,
  onToggle,
}: {
  provenance: LessonProvenance;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const score = provenance.groundingScore ?? 0;

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        score >= 0.6
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : score >= 0.3
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      }`}
      title={`${Math.round(score * 100)}% grounded in knowledge sources`}
    >
      {score >= 0.6 ? (
        <ShieldCheck className="w-3.5 h-3.5" />
      ) : score >= 0.3 ? (
        <Shield className="w-3.5 h-3.5" />
      ) : (
        <ShieldAlert className="w-3.5 h-3.5" />
      )}
      {Math.round(score * 100)}% grounded
    </button>
  );
}

/** Expandable detail panel showing provenance metrics and source citations. */
export function ProvenancePanel({
  provenance,
  components,
  isOpen,
  onToggle,
}: ProvenancePanelProps) {
  if (!isOpen) return null;

  return (
    <div className="mt-3 p-3 bg-hover rounded-lg border border-subtle">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-primary">Knowledge Source Attribution</span>
        <button onClick={onToggle} className="text-muted hover:text-primary">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-muted block">Sources</span>
          <span className="text-primary font-medium">{provenance.sourceCount ?? 0}</span>
        </div>
        <div>
          <span className="text-muted block">Course tokens</span>
          <span className="text-primary font-medium">{provenance.courseTokens ?? 0}</span>
        </div>
        <div>
          <span className="text-muted block">Team tokens</span>
          <span className="text-primary font-medium">{provenance.teamTokens ?? 0}</span>
        </div>
        <div>
          <span className="text-muted block">Ungrounded</span>
          <span className="text-primary font-medium">{provenance.ungroundedTokens ?? 0}</span>
        </div>
      </div>
      {/* Source chunks from component provenances */}
      {components?.some(c => c.provenance?.sourceChunks?.length) && (
        <div className="mt-3 border-t border-subtle pt-2">
          <span className="text-xs font-medium text-primary block mb-1.5">Source Citations</span>
          <div className="max-h-40 overflow-y-auto space-y-1.5">
            {(() => {
              const seen = new Set<string>();
              return components
                .flatMap(c => c.provenance?.sourceChunks ?? [])
                .filter(chunk => {
                  if (seen.has(chunk.sourceId + chunk.excerpt)) return false;
                  seen.add(chunk.sourceId + chunk.excerpt);
                  return true;
                })
                .slice(0, 10)
                .map((chunk, i) => (
                  <div key={i} className="text-xs p-2 bg-surface rounded border border-subtle">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-primary truncate">{chunk.sourceName || 'Unknown'}</span>
                      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded ${
                        chunk.similarityScore >= 0.8
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : chunk.similarityScore >= 0.6
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {Math.round(chunk.similarityScore * 100)}%
                      </span>
                    </div>
                    {chunk.excerpt && (
                      <p className="text-secondary mt-1 leading-relaxed line-clamp-2">
                        &ldquo;{chunk.excerpt}&rdquo;
                      </p>
                    )}
                  </div>
                ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
