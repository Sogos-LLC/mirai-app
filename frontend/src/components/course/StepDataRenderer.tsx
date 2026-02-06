'use client';

import React, { useState, useCallback } from 'react';
import {
  Target,
  ListTree,
  BookOpen,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { WorkflowStepType } from '@/gen/mirai/v1/ai_generation_types_pb';

// ============================================================
// Step Data Shape Interfaces
// ============================================================

interface AnalysisStepData {
  purpose_statement: string;
  learner_assumptions: string[];
  constraints: string[];
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

interface Section {
  title: string;
  description?: string;
  mapped_outcomes: string[];
}

interface StructureStepData {
  sections: Section[];
}

interface LessonBlock {
  type: string;
  content: string;
  heading?: string;
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
  sample_blocks: LessonBlock[];
}

interface QAStepData {
  qa: {
    outcome_coverage: Record<string, boolean>;
    redundancy_flags: string[];
    cognitive_load_flags: string[];
    accessibility_flags: string[];
  };
  total_sections: number;
  total_lessons: number;
  total_blocks: number;
  all_outcomes_covered: boolean;
  has_issues: boolean;
}

// ============================================================
// Main Component
// ============================================================

interface StepDataRendererProps {
  step: WorkflowStepType;
  data: Record<string, unknown>;
  onModificationsChange?: (mods: Record<string, string>) => void;
}

export function StepDataRenderer({ step, data, onModificationsChange }: StepDataRendererProps) {
  switch (step) {
    case WorkflowStepType.INTENT_ANALYSIS:
      return <AnalysisStep data={data as unknown as AnalysisStepData} onModificationsChange={onModificationsChange} />;
    case WorkflowStepType.DEFINE_SUCCESS:
      return <OutcomesStep data={data as unknown as OutcomesStepData} />;
    case WorkflowStepType.APPROVE_STRUCTURE:
      return <StructureStep data={data as unknown as StructureStepData} />;
    case WorkflowStepType.SAMPLE_LESSON:
      return <LessonStep data={data as unknown as LessonStepData} />;
    case WorkflowStepType.FINAL_REVIEW:
      return <FinalReviewStep data={data as unknown as QAStepData} />;
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

function AnalysisStep({ data, onModificationsChange }: { data: AnalysisStepData; onModificationsChange?: (mods: Record<string, string>) => void }) {
  const [purpose, setPurpose] = useState(data.purpose_statement ?? '');

  const handlePurposeChange = useCallback((val: string) => {
    setPurpose(val);
    onModificationsChange?.({ purpose_statement: val });
  }, [onModificationsChange]);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-1.5">
          <Target className="w-3.5 h-3.5" />
          <span>Purpose Statement</span>
        </div>
        <textarea
          value={purpose}
          onChange={(e) => handlePurposeChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none leading-relaxed"
        />
      </div>

      <div>
        <div className="text-xs text-muted font-medium mb-2">Learner Assumptions</div>
        <ul className="space-y-1.5">
          {(data.learner_assumptions ?? []).map((assumption, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-primary">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
              <span>{assumption}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="text-xs text-muted font-medium mb-2">Scope Constraints (Not Covered)</div>
        <ul className="space-y-1.5">
          {(data.constraints ?? []).map((constraint, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-secondary">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
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
// Step 3: Course Structure
// ============================================================

function StructureStep({ data }: { data: StructureStepData }) {
  const sections = data.sections ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <ListTree className="w-3.5 h-3.5" />
        <span>Course Structure &mdash; {sections.length} sections</span>
      </div>
      <div className="space-y-2">
        {sections.map((section, i) => (
          <CollapsibleSection key={i} title={`${i + 1}. ${section.title}`} defaultOpen={i < 3}>
            {section.description && (
              <p className="text-xs text-secondary mb-2">{section.description}</p>
            )}
            <div>
              <div className="text-[10px] text-muted font-medium mb-1">Mapped Outcomes:</div>
              <div className="flex flex-wrap gap-1.5">
                {(section.mapped_outcomes ?? []).map((outcome, j) => (
                  <span
                    key={j}
                    className="px-2 py-0.5 text-[11px] rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                  >
                    {outcome}
                  </span>
                ))}
              </div>
            </div>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Step 4: Sample Lesson
// ============================================================

function LessonStep({ data }: { data: LessonStepData }) {
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

      {/* Content blocks */}
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

      <p className="text-xs text-muted">
        This lesson sets the pattern for all remaining lessons.
        Approve the tone, depth, and structure — or regenerate with feedback.
      </p>
    </div>
  );
}

// ============================================================
// Step 5: Final Review
// ============================================================

function FinalReviewStep({ data }: { data: QAStepData }) {
  const qa = data.qa;
  if (!qa) return null;

  const coveredCount = Object.values(qa.outcome_coverage ?? {}).filter(Boolean).length;
  const totalOutcomes = Object.keys(qa.outcome_coverage ?? {}).length;

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-page p-3 text-center">
          <div className="text-2xl font-bold text-primary">{data.total_sections}</div>
          <div className="text-xs text-muted">Sections</div>
        </div>
        <div className="rounded-lg border bg-page p-3 text-center">
          <div className="text-2xl font-bold text-primary">{data.total_lessons}</div>
          <div className="text-xs text-muted">Lessons</div>
        </div>
        <div className="rounded-lg border bg-page p-3 text-center">
          <div className="text-2xl font-bold text-primary">{data.total_blocks}</div>
          <div className="text-xs text-muted">Content Blocks</div>
        </div>
      </div>

      {/* Outcome coverage */}
      <div>
        <div className="flex items-center gap-2 text-xs font-medium mb-2">
          {data.all_outcomes_covered ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-green-600 dark:text-green-400">
                All outcomes covered ({coveredCount}/{totalOutcomes})
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-amber-600 dark:text-amber-400">
                Outcome coverage: {coveredCount}/{totalOutcomes}
              </span>
            </>
          )}
        </div>
        <div className="space-y-1">
          {Object.entries(qa.outcome_coverage ?? {}).map(([outcome, covered]) => (
            <div key={outcome} className="flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full shrink-0 ${
                covered ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className={covered ? 'text-primary' : 'text-red-600 dark:text-red-400'}>
                {outcome}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Issues */}
      {data.has_issues && (
        <div className="space-y-3">
          {qa.redundancy_flags?.length > 0 && (
            <IssueList title="Redundancy" items={qa.redundancy_flags} color="amber" />
          )}
          {qa.cognitive_load_flags?.length > 0 && (
            <IssueList title="Cognitive Load" items={qa.cognitive_load_flags} color="orange" />
          )}
          {qa.accessibility_flags?.length > 0 && (
            <IssueList title="Accessibility" items={qa.accessibility_flags} color="blue" />
          )}
        </div>
      )}

      {!data.has_issues && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          <span className="text-sm text-green-700 dark:text-green-400">
            No quality issues detected. Course is ready for export.
          </span>
        </div>
      )}
    </div>
  );
}

function IssueList({ title, items, color }: { title: string; items: string[]; color: string }) {
  const colorMap: Record<string, string> = {
    amber: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400',
    orange: 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400',
    blue: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400',
  };

  return (
    <div className={`rounded-lg border p-2.5 ${colorMap[color] ?? colorMap.amber}`}>
      <div className="text-xs font-medium mb-1">{title}</div>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs">{item}</li>
        ))}
      </ul>
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
