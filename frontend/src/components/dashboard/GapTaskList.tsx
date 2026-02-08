'use client';

import { useState, useRef } from 'react';
import { AlertTriangle, Upload, CheckCircle, Clock, Loader2, BookOpen } from 'lucide-react';
import Button from '@/components/ui/Button';
import { KnowledgeUploadModal } from '@/components/settings/KnowledgeUploadModal';
import { useListGapTasksForUser, useCompleteGapTask } from '@/hooks/useKnowledgeGapTasks';
import { KnowledgeGapTaskStatus } from '@/gen/mirai/v1/knowledge_gap_pb';
import type { KnowledgeGapTask } from '@/gen/mirai/v1/knowledge_gap_pb';

function getStatusBadge(status: KnowledgeGapTaskStatus) {
  switch (status) {
    case KnowledgeGapTaskStatus.PENDING:
      return { label: 'Pending', icon: Clock, className: 'text-secondary bg-hover' };
    case KnowledgeGapTaskStatus.IN_PROGRESS:
      return { label: 'In Progress', icon: Loader2, className: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' };
    case KnowledgeGapTaskStatus.COMPLETED:
      return { label: 'Completed', icon: CheckCircle, className: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20' };
    default:
      return { label: 'Unknown', icon: Clock, className: 'text-muted bg-hover' };
  }
}

export function GapTaskList() {
  const { data: tasks, isLoading } = useListGapTasksForUser();
  const completeTask = useCompleteGapTask();

  const [uploadingTask, setUploadingTask] = useState<KnowledgeGapTask | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Only show pending and in_progress tasks
  const activeTasks = tasks.filter(
    (t) =>
      t.status === KnowledgeGapTaskStatus.PENDING ||
      t.status === KnowledgeGapTaskStatus.IN_PROGRESS
  );

  if (isLoading || activeTasks.length === 0) return null;

  const handleFileSelect = (task: KnowledgeGapTask) => {
    setUploadingTask(task);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleUploadSuccess = async () => {
    if (!uploadingTask) return;

    try {
      await completeTask.mutate({
        taskId: uploadingTask.id,
      });
    } catch {
      // Error is handled by the hook
    }

    setUploadingTask(null);
    setSelectedFile(null);
  };

  const handleUploadClose = () => {
    setUploadingTask(null);
    setSelectedFile(null);
  };

  return (
    <div className="bg-surface rounded-2xl border p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-semibold text-primary">Assigned Tasks</h3>
        <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
          {activeTasks.length}
        </span>
      </div>

      <p className="text-sm text-secondary mb-4">
        These knowledge gaps need your attention. Upload documents to fill the gaps and unblock course creation.
      </p>

      <div className="space-y-3">
        {activeTasks.map((task) => {
          const badge = getStatusBadge(task.status);
          const BadgeIcon = badge.icon;

          return (
            <div
              key={task.id}
              className="flex items-start gap-3 rounded-lg border bg-page p-4"
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary mb-1">
                  {task.gapDescription}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {task.assignedToName && (
                    <span>Assigned by course creator</span>
                  )}
                  {task.createdAt && (
                    <span>
                      {new Date(Number(task.createdAt.seconds) * 1000).toLocaleDateString()}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.className}`}>
                    <BadgeIcon className="w-3 h-3" />
                    {badge.label}
                  </span>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleFileSelect(task)}
                className="gap-1.5 shrink-0"
                disabled={completeTask.isPending}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload
              </Button>
            </div>
          );
        })}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.doc,.txt,.md,.pptx,.xlsx,.csv"
        onChange={handleFileChange}
      />

      {/* Upload modal - reuses existing KnowledgeUploadModal */}
      {selectedFile && uploadingTask && (
        <KnowledgeUploadModal
          file={selectedFile}
          teamId={uploadingTask.targetTeamId}
          onClose={handleUploadClose}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}

export default GapTaskList;
