'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  X,
  FileText,
  Check,
  Upload,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  Globe2,
  Users,
  BookOpen,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  useListKnowledgeSources,
  formatFileSize,
  KnowledgeSourceStatus,
} from '@/hooks/useTeamKnowledge';
import { useListTeams } from '@/hooks/useTeams';
import { KnowledgeUploadModal } from '@/components/settings/KnowledgeUploadModal';
import type { KnowledgeSource } from '@/hooks/useTeamKnowledge';

type Tab = 'global' | 'team';

interface KnowledgeSelectionModalProps {
  selectedTeamDocIds: string[];
  selectedGlobalDocIds: string[];
  onConfirm: (teamDocIds: string[], globalDocIds: string[]) => void;
  onClose: () => void;
}

const DEPTH_COLORS: Record<string, string> = {
  basic: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  intermediate: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function DepthBadge({ depth }: { depth: string }) {
  const colorClass = DEPTH_COLORS[depth.toLowerCase()] ?? 'bg-page text-secondary';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded ${colorClass}`}>
      {depth.charAt(0).toUpperCase() + depth.slice(1)}
    </span>
  );
}

function SourceCard({
  source,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
}: {
  source: KnowledgeSource;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}) {
  const docIndex = source.documentIndex;
  const topics = docIndex?.mainTopics ?? [];
  const concepts = docIndex?.keyConcepts ?? [];
  const depth = docIndex?.contentDepth ?? '';
  const estLessons = docIndex?.estimatedLessonCount ?? 0;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20'
          : 'border-subtle bg-page hover:bg-hover'
      }`}
    >
      {/* Main row — clickable to select */}
      <button
        type="button"
        onClick={onToggleSelect}
        className="w-full text-left p-3"
      >
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div
            className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
              isSelected
                ? 'bg-indigo-600 border-indigo-600'
                : 'border-subtle'
            }`}
          >
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted shrink-0" />
              <span className="text-sm font-medium text-primary truncate">
                {source.name}
              </span>
              {depth && <DepthBadge depth={depth} />}
            </div>

            {/* Summary (2 lines) */}
            {source.summary && (
              <p className="text-xs text-secondary mt-1 line-clamp-2">
                {source.summary}
              </p>
            )}

            {/* Stats row */}
            <div className="flex items-center gap-3 text-xs text-muted mt-1.5 flex-wrap">
              <span>{formatFileSize(source.fileSizeBytes)}</span>
              <span>{source.chunkCount} chunks</span>
              {source.tokenCount != null && source.tokenCount > 0 && (
                <span>{(source.tokenCount / 1000).toFixed(1)}k tokens</span>
              )}
              {estLessons > 0 && (
                <span>~{estLessons} lesson{estLessons === 1 ? '' : 's'}</span>
              )}
            </div>

            {/* Topic pills (first 3) */}
            {topics.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {topics.slice(0, 3).map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-surface border text-secondary"
                  >
                    {topic}
                  </span>
                ))}
                {topics.length > 3 && (
                  <span className="text-[10px] text-muted">
                    +{topics.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Expand toggle */}
      {(source.summary || topics.length > 3 || concepts.length > 0) && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-muted hover:text-secondary border-t transition-colors"
        >
          {isExpanded ? (
            <>
              Less <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              More <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      )}

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t pt-2 space-y-2">
          {source.summary && (
            <p className="text-xs text-secondary">{source.summary}</p>
          )}
          {topics.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-muted uppercase">Topics</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {topics.map((t) => (
                  <span key={t} className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-surface border text-secondary">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {concepts.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-muted uppercase">Key Concepts</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {concepts.map((c) => (
                  <span key={c} className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-surface border text-secondary">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {source.processedAt && source.processedAt.seconds != null && (
            <p className="text-[10px] text-muted">
              Processed {new Date(Number(source.processedAt.seconds) * 1000).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function KnowledgeSelectionModal({
  selectedTeamDocIds: initialTeamIds,
  selectedGlobalDocIds: initialGlobalIds,
  onConfirm,
  onClose,
}: KnowledgeSelectionModalProps) {
  // Selection state — single Set tracks all selected IDs (team + global)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set([...initialTeamIds, ...initialGlobalIds])
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Tab + team dropdown
  const [activeTab, setActiveTab] = useState<Tab>('global');
  const { data: teams } = useListTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedQuery(value), 250);
  }, []);

  // Upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data fetching
  const { sources: globalSources, isLoading: globalLoading } = useListKnowledgeSources();
  // Auto-select first team if available
  const effectiveTeamId = selectedTeamId || (teams.length > 0 ? teams[0].id : '');
  const { sources: teamSources, isLoading: teamLoading } = useListKnowledgeSources(
    effectiveTeamId || undefined,
    { enabled: activeTab === 'team' && !!effectiveTeamId },
  );

  // Track which IDs belong to which tab
  const globalSourceIds = useMemo(
    () => new Set(globalSources.map((s) => s.id)),
    [globalSources],
  );
  const teamSourceIds = useMemo(
    () => new Set(teamSources.map((s) => s.id)),
    [teamSources],
  );

  // Filter + search
  const activeSources = activeTab === 'global' ? globalSources : teamSources;
  const isLoading = activeTab === 'global' ? globalLoading : teamLoading;

  const filtered = useMemo(() => {
    const ready = activeSources.filter((s) => s.status === KnowledgeSourceStatus.READY);
    if (!debouncedQuery) return ready;
    const q = debouncedQuery.toLowerCase();
    return ready.filter((s) =>
      s.name.toLowerCase().includes(q)
      || s.documentIndex?.mainTopics?.some((t: string) => t.toLowerCase().includes(q))
      || s.documentIndex?.keyConcepts?.some((c: string) => c.toLowerCase().includes(q))
      || (s.summary ?? '').toLowerCase().includes(q)
    );
  }, [activeSources, debouncedQuery]);

  // Counts
  const globalReadyCount = globalSources.filter(
    (s) => s.status === KnowledgeSourceStatus.READY,
  ).length;
  const teamReadyCount = teamSources.filter(
    (s) => s.status === KnowledgeSourceStatus.READY,
  ).length;

  // Aggregate stats
  const selectedSources = [...globalSources, ...teamSources].filter((s) =>
    selected.has(s.id),
  );
  const totalChunks = selectedSources.reduce((sum, s) => sum + s.chunkCount, 0);
  const totalTokens = selectedSources.reduce(
    (sum, s) => sum + (s.tokenCount ?? 0),
    0,
  );
  const totalEstLessons = selectedSources.reduce(
    (sum, s) => sum + (s.documentIndex?.estimatedLessonCount ?? 0),
    0,
  );

  // Handlers
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const teamIds = Array.from(selected).filter((id) => teamSourceIds.has(id));
    const globalIds = Array.from(selected).filter((id) => globalSourceIds.has(id));
    onConfirm(teamIds, globalIds);
  }, [selected, teamSourceIds, globalSourceIds, onConfirm]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) setUploadFile(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [],
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded-xl shadow-xl max-w-5xl w-full max-h-[85vh] flex flex-col border sm:max-h-[85vh]">
          {/* ====== Header ====== */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 border-b gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={onClose}
                className="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-hover transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center sm:hidden"
              >
                <X className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-base font-semibold text-primary">Select Knowledge Sources</h2>
                <p className="text-xs text-muted mt-0.5">
                  Choose documents to ground course content
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search by name, topic, concept..."
                  className="w-full pl-9 pr-3 py-2 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-[36px]"
                />
              </div>
              <button
                onClick={onClose}
                className="hidden sm:flex p-1.5 text-muted hover:text-primary rounded-lg hover:bg-hover transition-colors min-h-[44px] min-w-[44px] items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ====== Tab bar ====== */}
          <div className="flex items-center justify-between px-5 py-2 border-b bg-page/50">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('global')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[32px] ${
                  activeTab === 'global'
                    ? 'bg-surface border shadow-sm text-primary'
                    : 'text-secondary hover:bg-hover'
                }`}
              >
                <Globe2 className="w-3.5 h-3.5" />
                Global
                <span className="text-[10px] text-muted">({globalReadyCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('team')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[32px] ${
                  activeTab === 'team'
                    ? 'bg-surface border shadow-sm text-primary'
                    : 'text-secondary hover:bg-hover'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Team
                <span className="text-[10px] text-muted">({teamReadyCount})</span>
              </button>

              {/* Team dropdown */}
              {activeTab === 'team' && teams.length > 1 && (
                <select
                  value={effectiveTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="ml-2 text-xs bg-surface border rounded-lg px-2 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[32px]"
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selected.size > 0 && (
              <span className="text-xs text-secondary">
                {selected.size} source{selected.size === 1 ? '' : 's'} selected
              </span>
            )}
          </div>

          {/* ====== Content (scrollable grid) ====== */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-muted animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                {debouncedQuery ? (
                  <>
                    <Search className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-sm text-secondary">
                      No sources match &ldquo;{debouncedQuery}&rdquo;
                    </p>
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(''); setDebouncedQuery(''); }}
                      className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 hover:underline"
                    >
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <BookOpen className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-sm text-secondary">
                      No {activeTab === 'team' ? 'team' : 'global'} knowledge sources available.
                    </p>
                    <p className="text-xs text-muted mt-1">Upload a document to get started.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    isSelected={selected.has(source.id)}
                    isExpanded={expanded.has(source.id)}
                    onToggleSelect={() => toggleSelect(source.id)}
                    onToggleExpand={() => toggleExpand(source.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ====== Footer ====== */}
          <div className="px-5 py-3 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            {/* Aggregate stats */}
            <div className="flex items-center gap-3 flex-wrap">
              {selected.size > 0 && (
                <span className="text-xs text-secondary">
                  {selected.size} doc{selected.size === 1 ? '' : 's'}
                  {totalChunks > 0 && <> &middot; {totalChunks} chunks</>}
                  {totalTokens > 0 && <> &middot; {(totalTokens / 1000).toFixed(1)}k tokens</>}
                  {totalEstLessons > 0 && <> &middot; ~{totalEstLessons} lessons</>}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.pdf,.docx"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleConfirm}>
                  Confirm{selected.size > 0 && ` (${selected.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload modal overlay */}
      {uploadFile && (
        <KnowledgeUploadModal
          file={uploadFile}
          teamId={activeTab === 'team' ? effectiveTeamId : undefined}
          onClose={() => setUploadFile(null)}
          onSuccess={() => setUploadFile(null)}
        />
      )}
    </>
  );
}
