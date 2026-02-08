'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Target,
  ListTree,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  FileSearch,
  Lightbulb,
  Users,
  Check,
  X,
} from 'lucide-react';
import { WorkflowStepType } from '@/gen/mirai/v1/ai_generation_types_pb';
import { LessonComponentType } from '@/gen/mirai/v1/component_enums_pb';
import { ComponentRenderer } from '@/components/course/renderers/ComponentRenderer';
import { GapTaskResumeBanner } from '@/components/course/GapTaskResumeBanner';

// ============================================================
// Step Data Shape Interfaces
// ============================================================

interface KnowledgeCoverage {
  gaps: string[];
  key_findings: string[];
  source_count: number;
  coverage_assessment: 'comprehensive' | 'moderate' | 'limited';
  recommended_format: 'full_course' | 'micro_course';
}

interface AnalysisStepData {
  purpose_statement: string;
  learner_assumptions: string[];
  constraints: string[];
  knowledge_coverage?: KnowledgeCoverage;
}

interface LearningOutcome {
  verb: string;
  object: string;
  condition: string;
  measurability_check: string;
}

interface OutcomesStepData {
  behavior_change: { description: string };
  goal: { goal_statement: string };
  outcomes: LearningOutcome[];
}

interface LessonPreview {
  title: string;
  objective: string;
}

interface Section {
  title: string;
  description?: string;
  mapped_outcomes: string[];
  lessons?: LessonPreview[];
}

interface StructureStepData {
  sections: Section[];
  total_lessons?: number;
}

interface LessonBlock {
  type: string;
  content: string;
  heading?: string;
}

interface PreviewComponent {
  id: string;
  type: number;
  order: number;
  contentJson: string;
}

interface LessonStepData {
  title: string;
  section_title: string;
  objective: {
    description: string;
    mapped_section_outcome: string;
  };
  strategy: {
    modality: string;
    interaction_types: string[];
    practice_type: string;
  };
  outline: {
    chunks: string[];
    objective_mapping: Record<string, string>;
  };
  sample_blocks?: LessonBlock[];
  components?: PreviewComponent[];
}

interface CombinedReviewData {
  analysis: AnalysisStepData;
  knowledge_coverage?: KnowledgeCoverage | null;
  outcomes: OutcomesStepData;
  structure: StructureStepData;
  sample_lesson: LessonStepData;
}

// ============================================================
// Main Component
// ============================================================

interface DeferralInfo {
  totalTasks: number;
  completedTasks: number;
}

interface StepDataRendererProps {
  step: WorkflowStepType;
  data: Record<string, unknown>;
  onModificationsChange?: (mods: Record<string, string>) => void;
  onAssignGaps?: (gaps: string[]) => void;
  deferralInfo?: DeferralInfo | null;
}

export function StepDataRenderer({ step, data, onModificationsChange, onAssignGaps, deferralInfo }: StepDataRendererProps) {
  switch (step) {
    case WorkflowStepType.INTENT_ANALYSIS:
      return <AnalysisStep data={data as unknown as AnalysisStepData} onModificationsChange={onModificationsChange} />;
    case WorkflowStepType.DEFINE_SUCCESS:
      return <OutcomesStep data={data as unknown as OutcomesStepData} />;
    case WorkflowStepType.APPROVE_STRUCTURE:
      return <OutlineStep data={data as unknown as StructureStepData} onModificationsChange={onModificationsChange} />;
    case WorkflowStepType.SAMPLE_LESSON:
      return <LessonStep data={data as unknown as LessonStepData} />;
    case WorkflowStepType.COMBINED_REVIEW:
      return (
        <CombinedReviewTabs
          data={data as unknown as CombinedReviewData}
          onModificationsChange={onModificationsChange}
          onAssignGaps={onAssignGaps}
          deferralInfo={deferralInfo}
        />
      );
    default:
      return (
        <pre className="text-xs text-secondary font-mono whitespace-pre-wrap break-words">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
  }
}

// ============================================================
// Step 1: Course Analysis
// ============================================================

function KnowledgeCoveragePanel({ coverage, onAssignGaps }: { coverage: KnowledgeCoverage; onAssignGaps?: (gaps: string[]) => void }) {
  const assessmentConfig = {
    comprehensive: {
      icon: ShieldCheck,
      label: 'Comprehensive Coverage',
      description: 'Your source materials cover this topic well.',
      borderColor: 'border-green-200 dark:border-green-800',
      bgColor: 'bg-green-50 dark:bg-green-950/20',
      textColor: 'text-green-700 dark:text-green-400',
      iconColor: 'text-green-600 dark:text-green-400',
    },
    moderate: {
      icon: ShieldAlert,
      label: 'Moderate Coverage',
      description: 'Your sources cover the core topics but have some gaps.',
      borderColor: 'border-amber-200 dark:border-amber-800',
      bgColor: 'bg-amber-50 dark:bg-amber-950/20',
      textColor: 'text-amber-700 dark:text-amber-400',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    limited: {
      icon: ShieldAlert,
      label: 'Limited Coverage',
      description: 'Your source materials have significant gaps for this topic.',
      borderColor: 'border-red-200 dark:border-red-800',
      bgColor: 'bg-red-50 dark:bg-red-950/20',
      textColor: 'text-red-700 dark:text-red-400',
      iconColor: 'text-red-600 dark:text-red-400',
    },
  } as const;

  const config = assessmentConfig[coverage.coverage_assessment];
  const Icon = config.icon;

  return (
    <div className="space-y-4">
      {/* Assessment banner */}
      <div className={`rounded-lg border p-4 ${config.borderColor} ${config.bgColor}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className={`w-5 h-5 ${config.iconColor} shrink-0`} />
          <span className={`text-sm font-semibold ${config.textColor}`}>{config.label}</span>
        </div>
        <p className={`text-sm ${config.textColor} ml-7 leading-relaxed`}>
          {config.description} ({coverage.source_count} source{coverage.source_count !== 1 ? 's' : ''} analyzed)
        </p>
      </div>

      {/* Key findings */}
      {coverage.key_findings.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-sm text-muted font-semibold mb-2">
            <Lightbulb className="w-4 h-4" />
            <span>What Your Sources Cover</span>
          </div>
          <ul className="space-y-2">
            {coverage.key_findings.map((finding, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-primary leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gaps */}
      {coverage.gaps.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-sm text-muted font-semibold mb-2">
            <FileSearch className="w-4 h-4" />
            <span>Knowledge Gaps</span>
          </div>
          <ul className="space-y-2">
            {coverage.gaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-primary leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>{gap}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Assign gaps button */}
      {coverage.gaps.length > 0 && onAssignGaps && coverage.coverage_assessment !== 'comprehensive' && (
        <button
          type="button"
          onClick={() => onAssignGaps(coverage.gaps)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 transition-colors min-h-[44px]"
        >
          <Users className="w-4 h-4" />
          Assign Gaps to Team
        </button>
      )}
    </div>
  );
}

function AnalysisStep({ data, onModificationsChange }: { data: AnalysisStepData; onModificationsChange?: (mods: Record<string, string>) => void }) {
  const [purpose, setPurpose] = useState(data.purpose_statement ?? '');

  const handlePurposeChange = useCallback((val: string) => {
    setPurpose(val);
    onModificationsChange?.({ purpose_statement: val });
  }, [onModificationsChange]);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted font-semibold mb-2">
          <Target className="w-4 h-4" />
          <span>Purpose Statement</span>
        </div>
        <textarea
          value={purpose}
          onChange={(e) => handlePurposeChange(e.target.value)}
          rows={4}
          className="w-full px-3 py-2.5 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none leading-relaxed"
        />
      </div>

      <div>
        <div className="text-sm text-muted font-semibold mb-2">Learner Assumptions</div>
        <ul className="space-y-2">
          {(data.learner_assumptions ?? []).map((assumption, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-primary leading-relaxed">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
              <span>{assumption}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="text-sm text-muted font-semibold mb-2">Scope Constraints (Not Covered)</div>
        <ul className="space-y-2">
          {(data.constraints ?? []).map((constraint, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-secondary leading-relaxed">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>{constraint}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted">Edit the purpose statement above, or approve as-is.</p>
    </div>
  );
}

// ============================================================
// Step 2: Learning Outcomes
// ============================================================

function OutcomesStep({ data }: { data: OutcomesStepData }) {
  return (
    <div className="space-y-5">
      {data.behavior_change && (
        <div className="rounded-lg border bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800 p-3">
          <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-1">Behavior Change</div>
          <p className="text-sm text-primary">{data.behavior_change.description}</p>
        </div>
      )}

      {data.goal && (
        <div>
          <div className="text-xs text-muted font-medium mb-1">Course Goal</div>
          <p className="text-sm font-medium text-primary">{data.goal.goal_statement}</p>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-3">
          <Target className="w-3.5 h-3.5" />
          <span>Learning Outcomes ({(data.outcomes ?? []).length})</span>
        </div>
        <div className="space-y-3">
          {(data.outcomes ?? []).map((outcome, i) => (
            <div key={i} className="rounded-lg border bg-page p-3">
              <div className="text-sm font-medium text-primary mb-1">
                <span className="text-indigo-600 dark:text-indigo-400">{outcome.verb}</span>{' '}
                {outcome.object}
              </div>
              <div className="text-xs text-secondary mb-1">
                <span className="text-muted">Condition:</span> {outcome.condition}
              </div>
              <div className="text-xs text-muted">
                <span className="font-medium">Assessment:</span> {outcome.measurability_check}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Step 3: Course Outline (main branch design)
// ============================================================

function InlineEdit({
  value,
  onChange,
  onSave,
  onCancel,
  className,
  inputClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`} onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave();
          if (e.key === 'Escape') onCancel();
        }}
        className={`flex-1 min-w-0 px-2 py-1 bg-page border rounded text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${inputClassName ?? 'text-sm'}`}
        autoFocus
      />
      <button
        type="button"
        onClick={onSave}
        className="p-1 rounded hover:bg-green-50 dark:hover:bg-green-950/20 text-green-600 dark:text-green-400 transition-colors"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 dark:text-red-400 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function OutlineStep({ data, onModificationsChange }: { data: StructureStepData; onModificationsChange?: (mods: Record<string, string>) => void }) {
  const sections = data.sections ?? [];
  const totalLessons = data.total_lessons ?? sections.reduce((sum, s) => sum + (s.lessons?.length ?? 0), 0);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const toggleSection = useCallback((index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const startEdit = useCallback((key: string, currentValue: string) => {
    setEditingKey(key);
    setEditValue(currentValue);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingKey) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditingKey(null);
      return;
    }
    const newOverrides = { ...overrides, [editingKey]: trimmed };
    setOverrides(newOverrides);
    setEditingKey(null);
    onModificationsChange?.(newOverrides);
  }, [editingKey, editValue, overrides, onModificationsChange]);

  const cancelEdit = useCallback(() => setEditingKey(null), []);

  const getDisplay = useCallback((key: string, original: string) => overrides[key] ?? original, [overrides]);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-2 text-sm text-secondary">
        <ListTree className="w-4 h-4" />
        <span>{sections.length} sections</span>
        <span className="text-muted">•</span>
        <BookOpen className="w-4 h-4" />
        <span>{totalLessons} lessons</span>
      </div>

      {/* Accordion outline */}
      <div className="border rounded-lg divide-y">
        {sections.map((section, sectionIndex) => {
          const isExpanded = expandedSections.has(sectionIndex);
          const sectionTitleKey = `section_${sectionIndex}_title`;
          const displayTitle = getDisplay(sectionTitleKey, section.title);
          const isEditingTitle = editingKey === sectionTitleKey;
          const lessonCount = section.lessons?.length ?? 0;

          return (
            <div key={sectionIndex} className="bg-surface">
              <button
                type="button"
                onClick={() => toggleSection(sectionIndex)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-hover transition-colors text-left min-h-[44px]"
              >
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-muted shrink-0" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted">
                      Section {sectionIndex + 1}
                    </span>
                    <span className="text-xs text-muted">
                      ({lessonCount} lesson{lessonCount !== 1 ? 's' : ''})
                    </span>
                  </div>
                  {isEditingTitle ? (
                    <InlineEdit
                      value={editValue}
                      onChange={setEditValue}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      className="mt-0.5"
                      inputClassName="text-sm font-semibold"
                    />
                  ) : (
                    <h3
                      className={`font-semibold text-primary truncate ${onModificationsChange ? 'hover:text-indigo-600 dark:hover:text-indigo-400 cursor-text' : ''}`}
                      onClick={onModificationsChange ? (e) => {
                        e.stopPropagation();
                        startEdit(sectionTitleKey, displayTitle);
                      } : undefined}
                    >
                      {displayTitle}
                    </h3>
                  )}
                </div>
              </button>

              {isExpanded && section.lessons && section.lessons.length > 0 && (
                <div className="px-4 pb-3 ml-8 space-y-2">
                  {section.lessons.map((lesson, lessonIndex) => {
                    const titleKey = `section_${sectionIndex}_lesson_${lessonIndex}_title`;
                    const objectiveKey = `section_${sectionIndex}_lesson_${lessonIndex}_objective`;
                    const displayLessonTitle = getDisplay(titleKey, lesson.title);
                    const displayObjective = getDisplay(objectiveKey, lesson.objective ?? '');
                    const isEditingLessonTitle = editingKey === titleKey;
                    const isEditingObjective = editingKey === objectiveKey;

                    return (
                      <div key={lessonIndex} className="flex items-start gap-3 p-2 rounded hover:bg-hover">
                        <BookOpen className="w-4 h-4 text-muted mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {isEditingLessonTitle ? (
                            <InlineEdit
                              value={editValue}
                              onChange={setEditValue}
                              onSave={saveEdit}
                              onCancel={cancelEdit}
                            />
                          ) : (
                            <p
                              className={`text-sm font-medium text-primary ${onModificationsChange ? 'hover:text-indigo-600 dark:hover:text-indigo-400 cursor-text' : ''}`}
                              onClick={onModificationsChange ? () => startEdit(titleKey, displayLessonTitle) : undefined}
                            >
                              {displayLessonTitle}
                            </p>
                          )}
                          {isEditingObjective ? (
                            <InlineEdit
                              value={editValue}
                              onChange={setEditValue}
                              onSave={saveEdit}
                              onCancel={cancelEdit}
                              className="mt-1"
                              inputClassName="text-xs"
                            />
                          ) : displayObjective ? (
                            <p
                              className={`text-xs text-secondary line-clamp-2 ${onModificationsChange ? 'hover:text-indigo-600 dark:hover:text-indigo-400 cursor-text' : ''}`}
                              onClick={onModificationsChange ? () => startEdit(objectiveKey, displayObjective) : undefined}
                            >
                              {displayObjective}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Step 4: Sample Lesson
// ============================================================

function LessonStep({ data }: { data: LessonStepData }) {
  // Convert preview components to proto-shaped objects for ComponentRenderer
  const protoComponents = useMemo(() => {
    if (!data.components?.length) return null;
    return data.components
      .sort((a, b) => a.order - b.order)
      .map((comp) => ({
        id: comp.id,
        type: comp.type as LessonComponentType,
        order: comp.order,
        contentJson: typeof comp.contentJson === 'string'
          ? comp.contentJson
          : JSON.stringify(comp.contentJson),
        $typeName: 'mirai.v1.LessonComponent' as const,
      }));
  }, [data.components]);

  return (
    <div className="space-y-5">
      {/* Lesson header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-1">
          <BookOpen className="w-3.5 h-3.5" />
          <span>{data.section_title}</span>
        </div>
        <h3 className="text-lg font-semibold text-primary">{data.title}</h3>
      </div>

      {/* Objective */}
      <div className="rounded-lg border bg-page p-3">
        <div className="text-xs text-muted font-medium mb-1">Lesson Objective</div>
        <p className="text-sm text-primary">{data.objective?.description}</p>
      </div>

      {/* Strategy */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-page p-2.5">
          <div className="text-[10px] text-muted mb-0.5">Modality</div>
          <div className="text-xs font-medium text-primary">{data.strategy?.modality}</div>
        </div>
        <div className="rounded-lg border bg-page p-2.5">
          <div className="text-[10px] text-muted mb-0.5">Practice</div>
          <div className="text-xs font-medium text-primary">{data.strategy?.practice_type}</div>
        </div>
        <div className="rounded-lg border bg-page p-2.5">
          <div className="text-[10px] text-muted mb-0.5">Interactions</div>
          <div className="text-xs font-medium text-primary">
            {(data.strategy?.interaction_types ?? []).join(', ')}
          </div>
        </div>
      </div>

      {/* Rendered components (new — actual component preview) */}
      {protoComponents && protoComponents.length > 0 ? (
        <div>
          <div className="text-xs text-muted font-medium mb-2">
            Lesson Preview ({protoComponents.length} components)
          </div>
          <div className="rounded-lg border bg-surface p-4 space-y-4">
            {protoComponents.map((comp) => (
              <ComponentRenderer
                key={comp.id}
                component={comp as never}
              />
            ))}
          </div>
        </div>
      ) : (data.sample_blocks ?? []).length > 0 ? (
        /* Fallback: old-style block preview */
        <div>
          <div className="text-xs text-muted font-medium mb-2">
            Content Blocks ({(data.sample_blocks ?? []).length})
          </div>
          <div className="space-y-2">
            {(data.sample_blocks ?? []).map((block, i) => (
              <div key={i} className="rounded-lg border bg-page p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                    block.type === 'heading' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                    block.type === 'quiz' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                    block.type === 'activity' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                    block.type === 'callout' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                    'bg-surface border text-muted'
                  }`}>
                    {block.type}
                  </span>
                  {block.heading && (
                    <span className="text-xs font-medium text-primary">{block.heading}</span>
                  )}
                </div>
                <p className="text-xs text-secondary whitespace-pre-wrap leading-relaxed">
                  {block.content.length > 300
                    ? block.content.substring(0, 300) + '...'
                    : block.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted">
        This lesson sets the pattern for all remaining lessons.
        Approve the tone, depth, and structure — or regenerate with feedback.
      </p>
    </div>
  );
}

// ============================================================
// Combined Review Tabs (single approval gate)
// ============================================================

function CombinedReviewTabs({
  data,
  onModificationsChange,
  onAssignGaps,
  deferralInfo,
}: {
  data: CombinedReviewData;
  onModificationsChange?: (mods: Record<string, string>) => void;
  onAssignGaps?: (gaps: string[]) => void;
  deferralInfo?: DeferralInfo | null;
}) {
  type TabId = 'outline' | 'analysis' | 'knowledge' | 'outcomes' | 'sample';
  const hasKnowledge = !!data.knowledge_coverage;
  const [activeTab, setActiveTab] = useState<TabId>('outline');
  const [analysisMods, setAnalysisMods] = useState<Record<string, string>>({});
  const [outlineMods, setOutlineMods] = useState<Record<string, string>>({});

  // Merge analysis + outline modifications and propagate up
  const handleAnalysisMods = useCallback((mods: Record<string, string>) => {
    setAnalysisMods(mods);
    onModificationsChange?.({ ...mods, ...outlineMods });
  }, [onModificationsChange, outlineMods]);

  const handleOutlineMods = useCallback((mods: Record<string, string>) => {
    setOutlineMods(mods);
    onModificationsChange?.({ ...analysisMods, ...mods });
  }, [onModificationsChange, analysisMods]);

  const tabs: { id: TabId; label: string; badge?: number; hidden?: boolean }[] = [
    { id: 'outline', label: 'Course Outline' },
    { id: 'analysis', label: 'Analysis' },
    {
      id: 'knowledge',
      label: 'Knowledge',
      badge: data.knowledge_coverage?.gaps?.length,
      hidden: !hasKnowledge,
    },
    { id: 'outcomes', label: 'Outcomes' },
    { id: 'sample', label: 'Sample Lesson' },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.filter((t) => !t.hidden).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-muted hover:text-secondary'
            }`}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'outline' && (
        <OutlineStep data={data.structure} onModificationsChange={handleOutlineMods} />
      )}
      {activeTab === 'analysis' && (
        <AnalysisStep data={data.analysis} onModificationsChange={handleAnalysisMods} />
      )}
      {activeTab === 'knowledge' && data.knowledge_coverage && (
        <>
          {deferralInfo && (
            <GapTaskResumeBanner
              totalTasks={deferralInfo.totalTasks}
              completedTasks={deferralInfo.completedTasks}
            />
          )}
          <KnowledgeCoveragePanel coverage={data.knowledge_coverage} onAssignGaps={onAssignGaps} />
        </>
      )}
      {activeTab === 'outcomes' && (
        <OutcomesStep data={data.outcomes} />
      )}
      {activeTab === 'sample' && (
        <LessonStep data={data.sample_lesson} />
      )}
    </div>
  );
}

// ============================================================
// Collapsible Section Helper
// ============================================================

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg bg-page">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-hover rounded-lg transition-colors min-h-[36px]"
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
        )}
        <span className="truncate">{title}</span>
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

export default StepDataRenderer;
