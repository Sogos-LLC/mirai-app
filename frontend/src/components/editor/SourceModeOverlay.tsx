'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  Globe,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  FileText,
  X,
} from 'lucide-react';
import { SourceType } from '@/gen/mirai/v1/ai_generation_types_pb';
import type { ComponentProvenance, ProvenanceChunk } from '@/gen/mirai/v1/ai_generation_types_pb';

// =============================================================================
// Source type utilities
// =============================================================================

type SourceTypeKey = 'internal' | 'web' | 'model' | 'validated';

const SOURCE_TYPE_CONFIG: Record<SourceTypeKey, {
  label: string;
  icon: typeof BookOpen;
  borderVar: string;
  bgVar: string;
  badgeBgVar: string;
  badgeTextVar: string;
}> = {
  internal: {
    label: 'Internal Knowledge',
    icon: BookOpen,
    borderVar: 'var(--source-internal-border)',
    bgVar: 'var(--source-internal-bg)',
    badgeBgVar: 'var(--source-internal-badge)',
    badgeTextVar: 'var(--source-internal-badge-text)',
  },
  web: {
    label: 'Web Search',
    icon: Globe,
    borderVar: 'var(--source-web-border)',
    bgVar: 'var(--source-web-bg)',
    badgeBgVar: 'var(--source-web-badge)',
    badgeTextVar: 'var(--source-web-badge-text)',
  },
  model: {
    label: 'AI Generated',
    icon: Sparkles,
    borderVar: 'var(--source-model-border)',
    bgVar: 'var(--source-model-bg)',
    badgeBgVar: 'var(--source-model-badge)',
    badgeTextVar: 'var(--source-model-badge-text)',
  },
  validated: {
    label: 'AI Validated',
    icon: CheckCircle2,
    borderVar: 'var(--source-validated-border)',
    bgVar: 'var(--source-validated-bg)',
    badgeBgVar: 'var(--source-validated-badge)',
    badgeTextVar: 'var(--source-validated-badge-text)',
  },
};

export function getSourceTypeKey(sourceType: SourceType | undefined, validated?: boolean): SourceTypeKey {
  switch (sourceType) {
    case SourceType.INTERNAL_KNOWLEDGE:
      return 'internal';
    case SourceType.WEB_SEARCH:
      return 'web';
    case SourceType.MODEL:
    default:
      return validated ? 'validated' : 'model';
  }
}

export function getSourceTypeConfig(sourceType: SourceType | undefined, validated?: boolean) {
  return SOURCE_TYPE_CONFIG[getSourceTypeKey(sourceType, validated)];
}

/**
 * Computes effective grounding score that counts validated MODEL components as grounded.
 * Returns a score between 0.0 and 1.0.
 */
export function computeEffectiveGrounding(
  components: Array<{
    provenance?: ComponentProvenance | undefined;
    validated?: boolean;
  }>,
  originalGroundingScore: number,
  totalTokenCount: number,
  groundedTokenCount: number,
): number {
  if (totalTokenCount <= 0) return originalGroundingScore;

  let validatedModelTokens = 0;
  for (const comp of components) {
    if (
      comp.validated &&
      (!comp.provenance?.dominantSourceType ||
        comp.provenance.dominantSourceType === SourceType.MODEL)
    ) {
      validatedModelTokens += comp.provenance?.totalTokens ?? 0;
    }
  }

  if (validatedModelTokens === 0) return originalGroundingScore;

  return Math.min(1, (groundedTokenCount + validatedModelTokens) / totalTokenCount);
}

function getDisplayHostname(url: string, sourceName?: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes('vertexaisearch.cloud.google.com')) {
      return sourceName || 'External Source';
    }
    return hostname;
  } catch {
    return sourceName || 'External Source';
  }
}

// =============================================================================
// Source Mode Overlay — wraps each component in source mode
// =============================================================================

interface SourceModeOverlayProps {
  provenance: ComponentProvenance | undefined;
  validated?: boolean;
  isValidatable?: boolean;
  onToggleValidated?: () => void;
  children: React.ReactNode;
}

export function SourceModeOverlay({ provenance, validated, isValidatable, onToggleValidated, children }: SourceModeOverlayProps) {
  const [showDetail, setShowDetail] = useState(false);
  const sourceType = provenance?.dominantSourceType ?? SourceType.MODEL;
  const config = getSourceTypeConfig(sourceType, validated);
  const Icon = config.icon;

  return (
    <div className="relative">
      {/* Left border indicator */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
        style={{ backgroundColor: config.borderVar }}
      />

      {/* Tinted background */}
      <div
        className="rounded-lg pl-3 pr-2 py-1 transition-colors"
        style={{ backgroundColor: config.bgVar }}
      >
        {/* Source type badge - top right */}
        <div className="flex justify-end mb-1 gap-1.5">
          {isValidatable && onToggleValidated && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleValidated();
              }}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                validated
                  ? 'opacity-60 hover:opacity-80'
                  : 'hover:opacity-80'
              }`}
              style={{
                backgroundColor: validated
                  ? SOURCE_TYPE_CONFIG.validated.badgeBgVar
                  : SOURCE_TYPE_CONFIG.model.badgeBgVar,
                color: validated
                  ? SOURCE_TYPE_CONFIG.validated.badgeTextVar
                  : SOURCE_TYPE_CONFIG.model.badgeTextVar,
              }}
              title={validated ? 'Mark as unvalidated' : 'Mark as validated'}
            >
              <CheckCircle2 className="w-3 h-3" />
              {validated ? 'Validated' : 'Validate'}
            </button>
          )}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDetail(!showDetail);
              }}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors hover:opacity-80"
              style={{
                backgroundColor: config.badgeBgVar,
                color: config.badgeTextVar,
              }}
            >
              <Icon className="w-3 h-3" />
              {config.label}
            </button>

            {/* Source detail popover — anchored to the pill */}
            {showDetail && provenance && (
              <SourceDetailPopover
                provenance={provenance}
                onClose={() => setShowDetail(false)}
              />
            )}
          </div>
        </div>

        {/* Original component content */}
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// Source Detail Popover — click-to-inspect source details
// =============================================================================

interface SourceDetailPopoverProps {
  provenance: ComponentProvenance;
  onClose: () => void;
}

function SourceDetailPopover({ provenance, onClose }: SourceDetailPopoverProps) {
  const sourceType = provenance.dominantSourceType ?? SourceType.MODEL;

  return (
    <div
      className="absolute right-0 top-full mt-2 z-50 w-80 max-h-96 overflow-y-auto rounded-lg shadow-lg border border-default bg-surface-elevated"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 bg-surface-elevated border-b border-subtle px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-primary">Source Details</span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-hover rounded transition-colors"
        >
          <X className="w-3.5 h-3.5 text-muted" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        {/* Source chunks */}
        {provenance.sourceChunks.length > 0 ? (
          provenance.sourceChunks.map((chunk, i) => (
            <SourceChunkCard key={i} chunk={chunk} />
          ))
        ) : (
          <ModelKnowledgeCard provenance={provenance} />
        )}
      </div>
    </div>
  );
}

/**
 * Renders a short text excerpt with basic inline markdown converted to HTML.
 * Handles **bold**, *italic*, and --- horizontal rules.
 */
export function MarkdownExcerpt({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|^---$)/gm);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-primary">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        if (part.trim() === '---') {
          return <span key={i} className="block my-1 border-t border-subtle" />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function SourceChunkCard({ chunk }: { chunk: ProvenanceChunk }) {
  const sourceType = chunk.sourceType ?? SourceType.UNSPECIFIED;
  const isWeb = sourceType === SourceType.WEB_SEARCH;
  const isInternal = sourceType === SourceType.INTERNAL_KNOWLEDGE;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="text-xs p-2.5 bg-hover rounded-lg border border-subtle">
      <div className="flex items-start gap-2">
        {isWeb ? (
          <Globe className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
        ) : isInternal ? (
          <BookOpen className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
        ) : (
          <FileText className="w-3.5 h-3.5 text-muted flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-primary truncate">
              {chunk.sourceName || chunk.pageTitle || 'Unknown Source'}
            </span>
            {chunk.similarityScore > 0 && (
              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                chunk.similarityScore >= 0.8
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : chunk.similarityScore >= 0.6
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              }`}>
                {Math.round(chunk.similarityScore * 100)}%
              </span>
            )}
          </div>

          {isInternal && chunk.teamName && (
            <div className="text-muted mt-0.5">{chunk.teamName}</div>
          )}

          {isWeb && chunk.url && (
            <a
              href={chunk.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="truncate">{getDisplayHostname(chunk.url, chunk.sourceName)}</span>
            </a>
          )}

          {chunk.excerpt && (
            <>
              <div className={`text-secondary mt-1.5 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                &ldquo;<MarkdownExcerpt text={chunk.excerpt} />&rdquo;
              </div>
              {chunk.excerpt.length > 100 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5"
                >
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ModelKnowledgeCard({ provenance }: { provenance: ComponentProvenance }) {
  return (
    <div className="text-xs p-2.5 bg-hover rounded-lg border border-subtle">
      <div className="flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-muted flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-primary">AI Generated</span>
          {provenance.modelName && (
            <div className="text-muted mt-0.5">
              Model: {provenance.modelName}
            </div>
          )}
          {provenance.generationContext && (
            <p className="text-secondary mt-1.5 leading-relaxed italic">
              {provenance.generationContext}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
