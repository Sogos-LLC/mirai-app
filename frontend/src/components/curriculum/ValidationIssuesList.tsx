'use client';

import React from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { IssueSeverity } from '@/gen/mirai/v1/curriculum_map_pb';
import type { CurriculumValidationIssue } from '@/gen/mirai/v1/curriculum_map_pb';

export interface ValidationIssuesListProps {
  /** Array of validation issues to display. */
  issues: CurriculumValidationIssue[];
  /** Whether any issue is an error. */
  hasErrors: boolean;
  /** Whether any issue is a warning. */
  hasWarnings: boolean;
}

/**
 * Displays validation issues from the curriculum map with severity-based
 * color coding (errors in red, warnings in amber, info in blue).
 */
export function ValidationIssuesList({
  issues,
  hasErrors,
}: ValidationIssuesListProps) {
  if (!issues || issues.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {hasErrors ? (
            <AlertCircle className="w-4 h-4 text-red-500" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          )}
          {issues.length} Validation {issues.length === 1 ? 'Issue' : 'Issues'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {issues.map((issue, idx) => (
            <div
              key={idx}
              className={`px-3 py-2 rounded text-xs ${
                issue.severity === IssueSeverity.ERROR
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                  : issue.severity === IssueSeverity.WARNING
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                  : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
              }`}
            >
              <span className="font-semibold">{issue.rule.replace(/_/g, ' ')}: </span>
              {issue.message}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
