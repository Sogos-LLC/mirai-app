'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useListGapTasksForUser } from '@/hooks/useKnowledgeGapTasks';
import { KnowledgeGapTaskStatus } from '@/gen/mirai/v1/knowledge_gap_pb';
import { GapTaskDetailModal } from './GapTaskDetailModal';

export function GapTaskList() {
  const { data: tasks, isLoading } = useListGapTasksForUser();
  const [showDetail, setShowDetail] = useState(false);

  // Only show pending and in_progress tasks
  const activeTasks = tasks.filter(
    (t) =>
      t.status === KnowledgeGapTaskStatus.PENDING ||
      t.status === KnowledgeGapTaskStatus.IN_PROGRESS
  );

  if (isLoading || activeTasks.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDetail(true)}
        className="w-full flex items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 mb-6 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors text-left min-h-[44px]"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0 animate-pulse" />
        <span className="flex-1 text-sm font-medium text-amber-800 dark:text-amber-300">
          You have {activeTasks.length} knowledge gap{activeTasks.length !== 1 ? ' tasks' : ' task'} assigned to you
        </span>
        <span className="flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400 shrink-0">
          View Tasks
          <ArrowRight className="w-4 h-4" />
        </span>
      </button>

      {showDetail && (
        <GapTaskDetailModal
          tasks={activeTasks}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}

export default GapTaskList;
