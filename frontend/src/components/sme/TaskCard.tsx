'use client';

import type { SMETask } from '@/gen/mirai/v1/sme_pb';
import type { User } from '@/gen/mirai/v1/common_pb';

interface TaskCardProps {
  task: SMETask;
  assignee?: User;
  currentUserId?: string;
  isAssigner?: boolean; // Whether current user is the one who assigned this task
  onCancel?: () => void;
  onSubmit?: () => void;
  onReview?: () => void; // For assigner to review submitted content
}

const STATUS_LABELS: Record<number, { label: string; color: string; hint: string }> = {
  0: { label: 'Unknown', color: 'bg-gray-100 text-gray-800', hint: 'Status unknown' },
  1: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', hint: 'Waiting for content submission' },
  2: { label: 'Submitted', color: 'bg-blue-100 text-blue-800', hint: 'Content submitted (legacy)' },
  3: { label: 'Processing', color: 'bg-purple-100 text-purple-800', hint: 'AI is processing the content' },
  4: { label: 'Completed', color: 'bg-green-100 text-green-800', hint: 'Successfully processed and approved' },
  5: { label: 'Failed', color: 'bg-red-100 text-red-800', hint: 'Processing failed' },
  6: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600', hint: 'Task was cancelled' },
  7: { label: 'Awaiting Review', color: 'bg-indigo-100 text-indigo-800', hint: 'Content submitted, awaiting approval' },
  8: { label: 'Changes Requested', color: 'bg-orange-100 text-orange-800', hint: 'Feedback provided, revision needed' },
};

const CONTENT_TYPE_LABELS: Record<number, string> = {
  0: 'Any',
  1: 'Document',
  2: 'Image',
  3: 'Video',
  4: 'Audio',
  5: 'URL',
  6: 'Text',
};

function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.charAt(0).toUpperCase() || '';
  const last = lastName?.charAt(0).toUpperCase() || '';
  return first + last || '?';
}

function getDisplayName(user?: User): string {
  if (!user) return 'Unknown';
  if (user.firstName || user.lastName) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
  }
  return user.email || 'Unknown User';
}

export function TaskCard({ task, assignee, currentUserId, isAssigner, onCancel, onSubmit, onReview }: TaskCardProps) {
  const status = STATUS_LABELS[task.status] || STATUS_LABELS[0];
  const contentType = CONTENT_TYPE_LABELS[task.expectedContentType] || CONTENT_TYPE_LABELS[0];
  const isPending = task.status === 1;
  const isAwaitingReview = task.status === 7;
  const isChangesRequested = task.status === 8;
  const isTerminal = task.status === 4 || task.status === 5 || task.status === 6; // Completed, Failed, or Cancelled
  const isAssignedToCurrentUser = currentUserId && task.assignedToUserId === currentUserId;
  const canSubmit = (isPending || isChangesRequested) && isAssignedToCurrentUser;
  const canReview = isAwaitingReview && isAssigner;

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${isTerminal ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-900 truncate flex-1 mr-2">{task.title}</h4>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.color} cursor-help flex-shrink-0`}
          title={status.hint}
        >
          {status.label}
        </span>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{task.description}</p>
      )}

      {/* Assignee */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
          {getInitials(assignee?.firstName, assignee?.lastName)}
        </div>
        <span className="text-xs text-gray-600 truncate">{getDisplayName(assignee)}</span>
        {isAssignedToCurrentUser && (
          <span className="text-xs text-blue-600 font-medium">(You)</span>
        )}
      </div>

      {/* Meta info */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
          {contentType}
        </span>
        {task.dueDate && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
            Due: {new Date(Number(task.dueDate.seconds) * 1000).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        {/* Submit/Resubmit button - for pending or changes requested tasks assigned to current user */}
        {canSubmit && onSubmit && (
          <button
            onClick={onSubmit}
            className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            {isChangesRequested ? 'Resubmit Content' : 'Submit Content'}
          </button>
        )}

        {/* Review button - for assigner when awaiting review */}
        {canReview && onReview && (
          <button
            onClick={onReview}
            className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
          >
            Review Submission
          </button>
        )}

        {/* Cancel button - only for pending tasks */}
        {isPending && onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
          >
            Cancel
          </button>
        )}

        {/* Status hint for non-actionable states */}
        {!canSubmit && !canReview && !isPending && (
          <span className="text-xs text-gray-400">
            {task.completedAt
              ? `Completed ${new Date(Number(task.completedAt.seconds) * 1000).toLocaleDateString()}`
              : status.hint}
          </span>
        )}
      </div>
    </div>
  );
}
