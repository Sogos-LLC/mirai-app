'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  CheckCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  BookOpen,
  MessageSquare,
  X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { KnowledgeUploadModal } from '@/components/settings/KnowledgeUploadModal';
import { useCompleteGapTask } from '@/hooks/useKnowledgeGapTasks';
import { useListKnowledgeSources } from '@/hooks/useTeamKnowledge';
import { KnowledgeGapTaskStatus, type KnowledgeGapTask } from '@/gen/mirai/v1/knowledge_gap_pb';
import { KnowledgeSourceStatus } from '@/gen/mirai/v1/knowledge_source_pb';

// =============================================================================
// Status Badge
// =============================================================================

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

function KnowledgeSourceStatusBadge({ status }: { status: number }) {
  switch (status) {
    case KnowledgeSourceStatus.READY:
      return <span className="text-[11px] text-green-600 dark:text-green-400">Ready</span>;
    case KnowledgeSourceStatus.PROCESSING:
      return <span className="text-[11px] text-amber-600 dark:text-amber-400">Processing</span>;
    case KnowledgeSourceStatus.PENDING:
      return <span className="text-[11px] text-muted">Pending</span>;
    default:
      return <span className="text-[11px] text-muted">Unknown</span>;
  }
}

// =============================================================================
// Existing Knowledge Section (Collapsible)
// =============================================================================

function ExistingKnowledgeSection({ teamId }: { teamId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { sources, isLoading } = useListKnowledgeSources(teamId);

  if (!teamId) return null;

  return (
    <div className="border-t pt-3 mt-3">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-secondary transition-colors"
      >
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <BookOpen className="w-3.5 h-3.5" />
        <span>Existing team knowledge ({sources.length})</span>
      </button>

      {isOpen && (
        <div className="mt-2 space-y-1.5 ml-5">
          {isLoading ? (
            <p className="text-xs text-muted">Loading...</p>
          ) : sources.length === 0 ? (
            <p className="text-xs text-muted">No documents in this team yet.</p>
          ) : (
            sources.map((source) => (
              <div key={source.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-3 h-3 text-muted shrink-0" />
                  <span className="text-primary truncate">{source.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <KnowledgeSourceStatusBadge status={source.status} />
                  {source.chunkCount > 0 && (
                    <span className="text-muted">{source.chunkCount} chunks</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Task Card — upload, add note, and mark complete are separate actions
// =============================================================================

function TaskCard({
  task,
  onUpload,
  onComplete,
  isCompleting,
  hasUploaded,
}: {
  task: KnowledgeGapTask;
  onUpload: (task: KnowledgeGapTask) => void;
  onComplete: (taskId: string, notes?: string) => void;
  isCompleting: boolean;
  hasUploaded: boolean;
}) {
  const [showNoteField, setShowNoteField] = useState(false);
  const [notes, setNotes] = useState('');
  const badge = getStatusBadge(task.status);
  const BadgeIcon = badge.icon;

  const canComplete = hasUploaded || notes.trim().length > 0;

  return (
    <div className="rounded-lg border bg-page p-4">
      {/* Gap description */}
      <p className="text-sm font-medium text-primary mb-2">{task.gapDescription}</p>

      {/* Context fields */}
      <div className="space-y-1 mb-3">
        {task.courseTitle && (
          <p className="text-xs text-secondary">
            <span className="text-muted">For course:</span> {task.courseTitle}
          </p>
        )}
        {task.assignedByName && (
          <p className="text-xs text-secondary">
            <span className="text-muted">Assigned by:</span> {task.assignedByName}
          </p>
        )}
        {task.targetTeamName && (
          <p className="text-xs text-secondary">
            <span className="text-muted">Upload to:</span> {task.targetTeamName}
          </p>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted mb-3">
        {task.createdAt && (
          <span>{new Date(Number(task.createdAt.seconds) * 1000).toLocaleDateString()}</span>
        )}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.className}`}>
          <BadgeIcon className="w-3 h-3" />
          {badge.label}
        </span>
        {hasUploaded && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20">
            <Upload className="w-3 h-3" />
            Document uploaded
          </span>
        )}
      </div>

      {/* Note field — toggled via Add Note button */}
      {showNoteField && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-secondary">Note</label>
            <button
              type="button"
              onClick={() => { setShowNoteField(false); setNotes(''); }}
              className="text-muted hover:text-secondary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Explain how this gap was addressed..."
            rows={2}
            className="w-full px-3 py-2 bg-surface border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none leading-relaxed"
            autoFocus
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onUpload(task)}
          className="gap-1.5"
          disabled={isCompleting}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Document
        </Button>
        {!showNoteField && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowNoteField(true)}
            className="gap-1.5"
            disabled={isCompleting}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Add Note
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={() => onComplete(task.id, notes.trim() || undefined)}
          className="gap-1.5"
          disabled={isCompleting || !canComplete}
        >
          {isCompleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5" />
          )}
          Mark Complete
        </Button>
      </div>

      {/* Existing knowledge for this team */}
      {task.targetTeamId && (
        <ExistingKnowledgeSection teamId={task.targetTeamId} />
      )}
    </div>
  );
}

// =============================================================================
// Main Modal
// =============================================================================

interface GapTaskDetailModalProps {
  tasks: KnowledgeGapTask[];
  onClose: () => void;
}

export function GapTaskDetailModal({ tasks, onClose }: GapTaskDetailModalProps) {
  const completeTask = useCompleteGapTask();

  const [uploadingTask, setUploadingTask] = useState<KnowledgeGapTask | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedTaskIds, setUploadedTaskIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((task: KnowledgeGapTask) => {
    setUploadingTask(task);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
    e.target.value = '';
  }, []);

  // Upload finishes — mark this task as having an uploaded doc
  const handleUploadSuccess = useCallback(() => {
    if (uploadingTask) {
      setUploadedTaskIds((prev) => new Set(prev).add(uploadingTask.id));
    }
    setUploadingTask(null);
    setSelectedFile(null);
  }, [uploadingTask]);

  const handleUploadClose = useCallback(() => {
    setUploadingTask(null);
    setSelectedFile(null);
  }, []);

  // Explicit complete with optional notes
  const handleComplete = useCallback(async (taskId: string, notes?: string) => {
    try {
      await completeTask.mutate({
        taskId,
        completionNotes: notes,
      });
    } catch {
      // Error handled by hook
    }
  }, [completeTask]);

  return (
    <>
      <ResponsiveModal
        isOpen={true}
        onClose={onClose}
        title={`Knowledge Gap Tasks (${tasks.length})`}
        size="xl"
        mobileHeight="full"
      >
        <div className="max-h-[60vh] overflow-y-auto space-y-3 p-1">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onUpload={handleFileSelect}
              onComplete={handleComplete}
              isCompleting={completeTask.isPending}
              hasUploaded={uploadedTaskIds.has(task.id)}
            />
          ))}
        </div>
      </ResponsiveModal>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.doc,.txt,.md,.pptx,.xlsx,.csv"
        onChange={handleFileChange}
      />

      {/* Upload modal — just uploads, does NOT complete the task */}
      {selectedFile && uploadingTask && (
        <KnowledgeUploadModal
          file={selectedFile}
          teamId={uploadingTask.targetTeamId}
          onClose={handleUploadClose}
          onSuccess={handleUploadSuccess}
        />
      )}
    </>
  );
}
