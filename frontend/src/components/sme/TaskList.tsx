'use client';

import type { SMETask } from '@/gen/mirai/v1/sme_pb';
import type { User } from '@/gen/mirai/v1/common_pb';
import { TaskCard } from './TaskCard';

interface TaskListProps {
  tasks: SMETask[];
  users?: Map<string, User>;
  currentUserId?: string;
  isLoading?: boolean;
  onCreateTask?: () => void;
  onCancelTask?: (taskId: string) => void;
  onSubmitToTask?: (task: SMETask) => void;
  onReviewTask?: (task: SMETask) => void;
}

export function TaskList({
  tasks,
  users = new Map(),
  currentUserId,
  isLoading = false,
  onCreateTask,
  onCancelTask,
  onSubmitToTask,
  onReviewTask,
}: TaskListProps) {
  // Sort tasks: pending first, then by created date descending
  const sortedTasks = [...tasks].sort((a, b) => {
    // Pending tasks first
    if (a.status === 1 && b.status !== 1) return -1;
    if (a.status !== 1 && b.status === 1) return 1;
    // Then by created date descending
    const aTime = a.createdAt ? Number(a.createdAt.seconds) : 0;
    const bTime = b.createdAt ? Number(b.createdAt.seconds) : 0;
    return bTime - aTime;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">
          Tasks {tasks.length > 0 && <span className="text-gray-500">({tasks.length})</span>}
        </h3>
        {onCreateTask && (
          <button
            onClick={onCreateTask}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Assign Task
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <svg className="animate-spin h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && tasks.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <svg
            className="mx-auto h-10 w-10 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-500">No tasks assigned yet</p>
          <p className="text-xs text-gray-400">Assign tasks to team members to collect knowledge</p>
          {onCreateTask && (
            <button
              onClick={onCreateTask}
              className="mt-4 inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Assign First Task
            </button>
          )}
        </div>
      )}

      {/* Task list */}
      {!isLoading && tasks.length > 0 && (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {sortedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assignee={users.get(task.assignedToUserId)}
              currentUserId={currentUserId}
              isAssigner={currentUserId ? task.assignedByUserId === currentUserId : false}
              onCancel={onCancelTask ? () => onCancelTask(task.id) : undefined}
              onSubmit={onSubmitToTask ? () => onSubmitToTask(task) : undefined}
              onReview={onReviewTask ? () => onReviewTask(task) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
