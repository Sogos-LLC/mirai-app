'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useCourseGenerationDetails } from '@/hooks/course/useCourseGenerationDetails';

export interface CourseDetailsInfo {
  id: string;
  title: string;
  createdAt?: { seconds: bigint };
  modifiedAt?: { seconds: bigint };
}

const PHASE_LABELS: Record<string, string> = {
  generate_course_analysis: 'Research & Analysis',
  generate_course_outcomes: 'Learning Outcomes',
  generate_course_structure: 'Course Structure',
  generate_sample_lesson: 'Sample Lesson',
  generate_lesson_components: 'Content Generation',
  review_section_components: 'Quality Assurance',
  run_course_qa: 'Final QA',
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface CourseDetailsModalProps {
  course: CourseDetailsInfo | null;
  onClose: () => void;
}

export function CourseDetailsModal({ course, onClose }: CourseDetailsModalProps) {
  const { data, isLoading, error } = useCourseGenerationDetails(course?.id ?? null);

  if (!course) return null;

  const costReport = data?.costReport;
  const job = data?.job;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-elevated border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-primary">Course Details</h2>
          <button
            onClick={onClose}
            className="p-2 text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Course Info */}
          <div>
            <h3 className="text-sm font-medium text-secondary mb-2">Course Info</h3>
            <div className="space-y-1">
              <p className="text-sm text-primary font-medium">{course.title || 'Untitled Course'}</p>
              <p className="text-xs text-muted">
                Created {course.createdAt?.seconds
                  ? new Date(Number(course.createdAt.seconds) * 1000).toLocaleDateString()
                  : 'N/A'}
              </p>
              <p className="text-xs text-muted">
                Modified {course.modifiedAt?.seconds
                  ? new Date(Number(course.modifiedAt.seconds) * 1000).toLocaleDateString()
                  : 'N/A'}
              </p>
            </div>
          </div>

          {/* Generation Cost */}
          <div>
            <h3 className="text-sm font-medium text-secondary mb-2">Generation Cost</h3>
            {isLoading ? (
              <p className="text-sm text-muted">Loading generation data...</p>
            ) : error ? (
              <p className="text-sm text-muted">No generation data available</p>
            ) : costReport ? (
              <div className="space-y-3">
                {/* Summary card */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-page rounded-lg p-3 text-center">
                    <p className="text-xs text-muted">Total Tokens</p>
                    <p className="text-sm font-semibold text-primary">{formatTokens(Number(costReport.totalTokens))}</p>
                  </div>
                  <div className="bg-page rounded-lg p-3 text-center">
                    <p className="text-xs text-muted">Est. Cost</p>
                    <p className="text-sm font-semibold text-primary">${costReport.estimatedCostUsd.toFixed(4)}</p>
                  </div>
                  <div className="bg-page rounded-lg p-3 text-center">
                    <p className="text-xs text-muted">Model</p>
                    <p className="text-sm font-semibold text-primary">{costReport.modelName || 'N/A'}</p>
                  </div>
                </div>

                {/* Phase breakdown */}
                {costReport.phases.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted mb-2">Phase Breakdown</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-page">
                            <th className="text-left px-3 py-2 text-muted font-medium">Phase</th>
                            <th className="text-right px-3 py-2 text-muted font-medium">Input</th>
                            <th className="text-right px-3 py-2 text-muted font-medium">Output</th>
                            <th className="text-right px-3 py-2 text-muted font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aggregatePhases(costReport.phases).map((phase) => (
                            <tr key={phase.phaseName} className="border-t">
                              <td className="px-3 py-2 text-primary">
                                {PHASE_LABELS[phase.phaseName] || phase.phaseName}
                                {phase.count > 1 && (
                                  <span className="text-muted ml-1">({phase.count}x)</span>
                                )}
                              </td>
                              <td className="text-right px-3 py-2 text-secondary">{formatTokens(Number(phase.inputTokens))}</td>
                              <td className="text-right px-3 py-2 text-secondary">{formatTokens(Number(phase.outputTokens))}</td>
                              <td className="text-right px-3 py-2 text-primary font-medium">{formatTokens(Number(phase.totalTokens))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Job info */}
                {job && (
                  <div className="text-xs text-muted space-y-0.5">
                    <p>Job tokens: {formatTokens(Number(job.tokensUsed))}</p>
                    <p>Requests: {costReport.totalRequests}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">No generation data available for this course.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AggregatedPhase {
  phaseName: string;
  inputTokens: bigint | number;
  outputTokens: bigint | number;
  totalTokens: bigint | number;
  requests: number;
  count: number;
}

function aggregatePhases(phases: readonly { phaseName: string; inputTokens: bigint; outputTokens: bigint; totalTokens: bigint; requests: number }[]): AggregatedPhase[] {
  const map = new Map<string, AggregatedPhase>();
  for (const p of phases) {
    const existing = map.get(p.phaseName);
    if (existing) {
      existing.inputTokens = Number(existing.inputTokens) + Number(p.inputTokens);
      existing.outputTokens = Number(existing.outputTokens) + Number(p.outputTokens);
      existing.totalTokens = Number(existing.totalTokens) + Number(p.totalTokens);
      existing.requests += p.requests;
      existing.count += 1;
    } else {
      map.set(p.phaseName, {
        phaseName: p.phaseName,
        inputTokens: Number(p.inputTokens),
        outputTokens: Number(p.outputTokens),
        totalTokens: Number(p.totalTokens),
        requests: p.requests,
        count: 1,
      });
    }
  }
  return Array.from(map.values());
}
