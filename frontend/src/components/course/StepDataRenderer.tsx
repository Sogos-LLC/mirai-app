'use client';

import React, { useState, useCallback } from 'react';
import {
  BookOpen,
  Target,
  User,
  Users,
  MessageSquare,
  Map,
  ListTree,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { WorkflowStepType } from '@/gen/mirai/v1/ai_generation_types_pb';

// ============================================================
// Step Data Shape Interfaces
// ============================================================

interface TitleStepData {
  improved_title: string;
  description: string;
}

interface OutcomesStepData {
  outcomes: string;
}

interface SMEPersona {
  id: string;
  job_title: string;
  description: string;
  skills: string[];
  voice: string;
}

interface SMEPersonasStepData {
  personas: SMEPersona[];
}

interface AudiencePersona {
  id: string;
  name: string;
  role: string;
  description: string;
  goals: string[];
}

interface AudiencePersonasStepData {
  personas: AudiencePersona[];
}

interface ToneOption {
  id: string;
  name: string;
  description: string;
  level_of_detail: string;
}

interface ToneOptionsStepData {
  options: ToneOption[];
}

interface PlannedLesson {
  title: string;
  description: string;
}

interface PlannedSection {
  title: string;
  description: string;
  lessons: PlannedLesson[];
}

interface CoursePlanStepData {
  plan: {
    planned_sections: PlannedSection[];
  };
}

interface OutlineLesson {
  id: string;
  title: string;
  description: string;
  learning_objectives: string[];
}

interface OutlineSection {
  id: string;
  title: string;
  lessons: OutlineLesson[];
}

interface OutlineStepData {
  outline: {
    sections: OutlineSection[];
  };
  constraint_violations?: string[];
}

// ============================================================
// Main Component
// ============================================================

interface StepDataRendererProps {
  step: WorkflowStepType;
  data: Record<string, unknown>;
  onSelectionChange?: (selectedIds: string[]) => void;
}

export function StepDataRenderer({ step, data, onSelectionChange }: StepDataRendererProps) {
  switch (step) {
    case WorkflowStepType.TITLE:
      return <TitleStep data={data as unknown as TitleStepData} />;
    case WorkflowStepType.OUTCOMES:
      return <OutcomesStep data={data as unknown as OutcomesStepData} />;
    case WorkflowStepType.SME_PERSONAS:
      return (
        <PersonaCards
          personas={(data as unknown as SMEPersonasStepData).personas ?? []}
          type="sme"
          onSelectionChange={onSelectionChange}
        />
      );
    case WorkflowStepType.AUDIENCE_PERSONAS:
      return (
        <PersonaCards
          personas={(data as unknown as AudiencePersonasStepData).personas ?? []}
          type="audience"
          onSelectionChange={onSelectionChange}
        />
      );
    case WorkflowStepType.TONE_OPTIONS:
      return (
        <ToneOptionCards
          options={(data as unknown as ToneOptionsStepData).options ?? []}
          onSelectionChange={onSelectionChange}
        />
      );
    case WorkflowStepType.COURSE_PLAN:
      return <CoursePlanStep data={data as unknown as CoursePlanStepData} />;
    case WorkflowStepType.OUTLINE:
      return <OutlineStep data={data as unknown as OutlineStepData} />;
    default:
      return (
        <pre className="text-xs text-secondary font-mono whitespace-pre-wrap break-words">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
  }
}

// ============================================================
// Title Step
// ============================================================

function TitleStep({ data }: { data: TitleStepData }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <BookOpen className="w-3.5 h-3.5" />
        <span>Proposed Title</span>
      </div>
      <h4 className="text-base font-semibold text-primary">
        {data.improved_title}
      </h4>
      {data.description && (
        <p className="text-sm text-secondary leading-relaxed">
          {data.description}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Outcomes Step
// ============================================================

function OutcomesStep({ data }: { data: OutcomesStepData }) {
  const outcomes = (data.outcomes ?? '')
    .split('\n')
    .map((line) => line.replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Target className="w-3.5 h-3.5" />
        <span>Learning Outcomes</span>
      </div>
      <ul className="space-y-2">
        {outcomes.map((outcome, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-primary">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
            <span>{outcome}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// Persona Cards (SME + Audience)
// ============================================================

interface PersonaCardsProps {
  personas: (SMEPersona | AudiencePersona)[];
  type: 'sme' | 'audience';
  onSelectionChange?: (selectedIds: string[]) => void;
}

function PersonaCards({ personas, type, onSelectionChange }: PersonaCardsProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(personas.map((p) => p.id))
  );

  const toggleSelection = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        onSelectionChange?.(Array.from(next));
        return next;
      });
    },
    [onSelectionChange]
  );

  const isSME = type === 'sme';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        {isSME ? <User className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
        <span>
          {isSME ? 'Subject Matter Experts' : 'Target Audience'}
        </span>
        <span className="text-muted">— select personas to include</span>
      </div>
      <div className="space-y-2">
        {personas.map((persona) => {
          const isSelected = selectedIds.has(persona.id);
          const sme = persona as SMEPersona;
          const audience = persona as AudiencePersona;

          return (
            <button
              key={persona.id}
              type="button"
              onClick={() => toggleSelection(persona.id)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20'
                  : 'border-subtle bg-page hover:bg-hover'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'border-subtle'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-primary">
                    {isSME ? sme.job_title : audience.name}
                  </div>
                  {!isSME && audience.role && (
                    <div className="text-xs text-muted mt-0.5">{audience.role}</div>
                  )}
                  <p className="text-xs text-secondary mt-1 line-clamp-2">
                    {persona.description}
                  </p>
                  {isSME && sme.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {sme.skills.slice(0, 4).map((skill) => (
                        <span
                          key={skill}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-surface border text-muted"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  {!isSME && audience.goals?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {audience.goals.slice(0, 3).map((goal) => (
                        <span
                          key={goal}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-surface border text-muted"
                        >
                          {goal}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Tone Option Cards
// ============================================================

interface ToneOptionCardsProps {
  options: ToneOption[];
  onSelectionChange?: (selectedIds: string[]) => void;
}

function ToneOptionCards({ options, onSelectionChange }: ToneOptionCardsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    options.length > 0 ? options[0].id : null
  );

  const selectTone = useCallback(
    (id: string) => {
      setSelectedId(id);
      onSelectionChange?.([id]);
    },
    [onSelectionChange]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <MessageSquare className="w-3.5 h-3.5" />
        <span>Tone & Style</span>
        <span className="text-muted">— select one</span>
      </div>
      <div className="space-y-2">
        {options.map((option) => {
          const isSelected = selectedId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => selectTone(option.id)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20'
                  : 'border-subtle bg-page hover:bg-hover'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? 'border-indigo-600'
                      : 'border-subtle'
                  }`}
                >
                  {isSelected && (
                    <div className="h-2 w-2 rounded-full bg-indigo-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">{option.name}</span>
                    {option.level_of_detail && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-surface border text-muted">
                        {option.level_of_detail}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-secondary mt-1">{option.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Course Plan Step
// ============================================================

function CoursePlanStep({ data }: { data: CoursePlanStepData }) {
  const sections = data.plan?.planned_sections ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Map className="w-3.5 h-3.5" />
        <span>Course Plan — {sections.length} sections</span>
      </div>
      <div className="space-y-1.5">
        {sections.map((section, i) => (
          <CollapsibleSection key={i} title={section.title} defaultOpen={i === 0}>
            <p className="text-xs text-secondary mb-2">{section.description}</p>
            {section.lessons?.length > 0 && (
              <ul className="space-y-1">
                {section.lessons.map((lesson, j) => (
                  <li key={j} className="flex items-start gap-2 text-xs text-primary">
                    <span className="text-muted shrink-0 mt-0.5">{j + 1}.</span>
                    <div>
                      <span className="font-medium">{lesson.title}</span>
                      {lesson.description && (
                        <span className="text-secondary ml-1">— {lesson.description}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Outline Step
// ============================================================

function OutlineStep({ data }: { data: OutlineStepData }) {
  const sections = data.outline?.sections ?? [];
  const violations = data.constraint_violations ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <ListTree className="w-3.5 h-3.5" />
        <span>Course Outline — {sections.length} sections</span>
      </div>
      {violations.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Constraint Warnings</span>
          </div>
          <ul className="space-y-0.5">
            {violations.map((v, i) => (
              <li key={i} className="text-xs text-amber-600 dark:text-amber-400">
                {v}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-1.5">
        {sections.map((section, i) => (
          <CollapsibleSection key={section.id ?? i} title={section.title} defaultOpen={i === 0}>
            {section.lessons?.map((lesson, j) => (
              <div key={lesson.id ?? j} className="mb-2 last:mb-0">
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-muted shrink-0 mt-0.5">{j + 1}.</span>
                  <div className="flex-1">
                    <span className="font-medium text-primary">{lesson.title}</span>
                    {lesson.description && (
                      <p className="text-secondary mt-0.5">{lesson.description}</p>
                    )}
                    {lesson.learning_objectives?.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {lesson.learning_objectives.map((obj, k) => (
                          <li key={k} className="flex items-start gap-1.5 text-[11px] text-muted">
                            <span className="mt-1 h-1 w-1 rounded-full bg-current shrink-0" />
                            <span>{obj}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CollapsibleSection>
        ))}
      </div>
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
