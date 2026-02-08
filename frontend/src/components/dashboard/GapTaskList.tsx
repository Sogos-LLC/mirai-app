'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle, Send } from 'lucide-react';
import { useListGapTasksForUser } from '@/hooks/useKnowledgeGapTasks';
import { KnowledgeGapTaskStatus } from '@/gen/mirai/v1/knowledge_gap_pb';
import { GapTaskDetailModal } from './GapTaskDetailModal';

export function GapTaskList() {
  const { data: tasks, isLoading } = useListGapTasksForUser();
  const [showDetail, setShowDetail] = useState(false);

  const activeTasks = tasks.filter(
    (t) =>
      t.status === KnowledgeGapTaskStatus.PENDING ||
      t.status === KnowledgeGapTaskStatus.IN_PROGRESS
  );
  const completedTasks = tasks.filter(
    (t) => t.status === KnowledgeGapTaskStatus.COMPLETED
  );
  const hasActive = activeTasks.length > 0;
  const allSubmitted = !hasActive && completedTasks.length > 0 && completedTasks.every((t) => t.submittedAt);

  if (isLoading || tasks.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDetail(true)}
        className={`w-full flex items-center gap-3 rounded-2xl border p-4 mb-6 transition-colors text-left min-h-[44px] ${
          hasActive
            ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/30'
            : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/30'
        }`}
      >
        {hasActive ? (
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0 animate-pulse" />
        ) : allSubmitted ? (
          <Send className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
        ) : (
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
        )}
        <span className={`flex-1 text-sm font-medium ${
          hasActive
            ? 'text-amber-800 dark:text-amber-300'
            : 'text-green-800 dark:text-green-300'
        }`}>
          {hasActive
            ? `You have ${activeTasks.length} knowledge gap${activeTasks.length !== 1 ? ' tasks' : ' task'} assigned to you`
            : allSubmitted
              ? `All ${tasks.length} knowledge gap${tasks.length !== 1 ? ' tasks' : ' task'} completed and submitted`
              : `All ${tasks.length} knowledge gap${tasks.length !== 1 ? ' tasks' : ' task'} completed — ready to submit`}
        </span>
        <span className={`flex items-center gap-1 text-sm font-medium shrink-0 ${
          hasActive
            ? 'text-amber-700 dark:text-amber-400'
            : 'text-green-700 dark:text-green-400'
        }`}>
          View Tasks
          <ArrowRight className="w-4 h-4" />
        </span>
      </button>

      {showDetail && (
        <GapTaskDetailModal
          tasks={tasks}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}

export default GapTaskList;
