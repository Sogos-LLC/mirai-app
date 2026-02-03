'use client';

import React, { useState, useCallback } from 'react';
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
  Trash2,
  Database,
  FileStack,
  Coins,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  useListTeamKnowledgeSources,
  useQueueTeamKnowledgeIngestion,
  useDeleteTeamKnowledgeSource,
  useTeamKnowledgeSummary,
  useIngestionStatusStream,
} from '@/hooks/useTeamKnowledge';
import { KnowledgeSourceStatus } from '@/gen/mirai/v1/knowledge_source_pb';

interface TeamKnowledgePanelProps {
  teamId: string;
}

const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'text/plain',
  'text/markdown',
];

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

const STATUS_LABELS: Record<number, { label: string; color: string; icon: React.ReactNode }> = {
  [KnowledgeSourceStatus.UNSPECIFIED]: {
    label: 'Unknown',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    icon: <AlertCircle className="w-3 h-3" />,
  },
  [KnowledgeSourceStatus.PENDING]: {
    label: 'Pending',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  [KnowledgeSourceStatus.PROCESSING]: {
    label: 'Processing',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  [KnowledgeSourceStatus.READY]: {
    label: 'Ready',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    icon: <CheckCircle className="w-3 h-3" />,
  },
  [KnowledgeSourceStatus.FAILED]: {
    label: 'Failed',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    icon: <AlertCircle className="w-3 h-3" />,
  },
};

function formatFileSize(bytes: number | bigint): string {
  const numBytes = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (numBytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(numBytes) / Math.log(k));
  return parseFloat((numBytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(timestamp: { seconds?: bigint } | undefined): string {
  if (!timestamp?.seconds) return 'N/A';
  const date = new Date(Number(timestamp.seconds) * 1000);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTokens(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K';
  }
  return count.toString();
}

export function TeamKnowledgePanel({ teamId }: TeamKnowledgePanelProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());

  // Hooks
  const { data: sources, isLoading, error } = useListTeamKnowledgeSources(teamId);
  const { totalSources, totalChunks, totalTokens, isLoading: summaryLoading } = useTeamKnowledgeSummary(teamId);
  const queueIngestion = useQueueTeamKnowledgeIngestion();
  const deleteSource = useDeleteTeamKnowledgeSource();

  // Subscribe to ingestion status updates (SSE)
  useIngestionStatusStream();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const invalidFiles: string[] = [];

      for (const file of fileArray) {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        const isValidType = SUPPORTED_TYPES.includes(file.type) || SUPPORTED_EXTENSIONS.includes(ext);

        if (!isValidType) {
          invalidFiles.push(file.name);
          continue;
        }

        // Check for duplicates
        const isDuplicate = sources.some((s) => s.name === file.name);
        if (isDuplicate) {
          setUploadError(`File "${file.name}" already exists in team knowledge.`);
          continue;
        }

        // Upload file
        const fileKey = `${file.name}-${Date.now()}`;
        setUploadingFiles((prev) => new Set(prev).add(fileKey));

        try {
          const arrayBuffer = await file.arrayBuffer();
          await queueIngestion.mutate({
            teamId,
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            fileContent: new Uint8Array(arrayBuffer),
          });
          setUploadError(null);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Upload failed';
          setUploadError(`Failed to upload "${file.name}": ${errorMsg}`);
        } finally {
          setUploadingFiles((prev) => {
            const next = new Set(prev);
            next.delete(fileKey);
            return next;
          });
        }
      }

      if (invalidFiles.length > 0) {
        setUploadError(
          `Unsupported file types: ${invalidFiles.join(', ')}. Supported: PDF, DOCX, TXT, Markdown`
        );
      }
    },
    [teamId, sources, queueIngestion]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
        e.target.value = ''; // Reset input
      }
    },
    [processFiles]
  );

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;

    setDeletingId(deleteConfirmId);
    try {
      await deleteSource.mutate(deleteConfirmId);
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Failed to delete source:', err);
      setUploadError('Failed to delete document. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const isUploading = uploadingFiles.size > 0 || queueIngestion.isPending;

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team Knowledge Base</CardTitle>
          <CardDescription>Shared documents available to all team courses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team Knowledge Base</CardTitle>
          <CardDescription>Shared documents available to all team courses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
            <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              Failed to load team knowledge sources.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Team Knowledge Base</CardTitle>
          <CardDescription>
            Shared documents available to all team courses. Upload documents to enhance AI-generated content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary Stats */}
          {!summaryLoading && totalSources > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 bg-hover rounded-lg">
                <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                  <FileStack className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-primary">{totalSources}</p>
                  <p className="text-xs text-muted">Documents</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-hover rounded-lg">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-primary">{totalChunks.toLocaleString()}</p>
                  <p className="text-xs text-muted">Chunks</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-hover rounded-lg">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Coins className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-primary">{formatTokens(totalTokens)}</p>
                  <p className="text-xs text-muted">Tokens</p>
                </div>
              </div>
            </div>
          )}

          {/* Upload Error */}
          {uploadError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {uploadError}
              <button
                onClick={() => setUploadError(null)}
                className="ml-auto hover:text-red-900 dark:hover:text-red-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Upload Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center transition-colors
              ${isDragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-600 bg-surface'}
            `}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-primary-600" />
                <p className="text-primary font-medium mb-1">Uploading...</p>
                <p className="text-sm text-muted">Processing and indexing your document</p>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted" />
                <p className="text-primary font-medium mb-1">
                  Drag and drop files here, or{' '}
                  <label className="text-primary-600 hover:text-primary-700 cursor-pointer underline dark:text-primary-400 dark:hover:text-primary-300">
                    browse
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt,.md"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </label>
                </p>
                <p className="text-sm text-muted">Supported: PDF, DOCX, TXT, Markdown</p>
              </>
            )}
          </div>

          {/* Source List */}
          {sources.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-primary mb-3">
                Documents ({sources.length})
              </h3>
              <div className="divide-y divide-border rounded-lg border overflow-hidden">
                {sources.map((source) => {
                  const statusInfo = STATUS_LABELS[source.status] || STATUS_LABELS[KnowledgeSourceStatus.UNSPECIFIED];
                  const isDeleting = deletingId === source.id;

                  return (
                    <div
                      key={source.id}
                      className="flex items-center justify-between px-4 py-3 bg-surface hover:bg-hover transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FileText className="w-5 h-5 text-primary-600 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-primary truncate" title={source.name}>
                            {source.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
                            <span>{formatFileSize(source.fileSizeBytes)}</span>
                            {source.chunkCount > 0 && (
                              <>
                                <span>|</span>
                                <span>{source.chunkCount} chunks</span>
                              </>
                            )}
                            {source.tokenCount && source.tokenCount > 0 && (
                              <>
                                <span>|</span>
                                <span>{formatTokens(source.tokenCount)} tokens</span>
                              </>
                            )}
                            <span>|</span>
                            <span>{formatDate(source.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
                          title={source.errorMessage}
                        >
                          {statusInfo.icon}
                          {statusInfo.label}
                        </span>
                        <button
                          onClick={() => setDeleteConfirmId(source.id)}
                          disabled={isDeleting}
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Delete document"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <FileStack className="w-12 h-12 mx-auto text-muted mb-2" />
              <h3 className="text-sm font-medium text-primary">No documents yet</h3>
              <p className="text-sm text-secondary mt-1">
                Upload documents to build your team&apos;s knowledge base.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
      <ResponsiveModal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Document"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteConfirm}
              disabled={deletingId !== null}
            >
              {deletingId !== null ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-primary">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
            <p className="text-sm text-secondary mt-2">
              The document and all its indexed content will be permanently removed from the team knowledge base.
            </p>
          </div>
        </div>
      </ResponsiveModal>
    </>
  );
}

export default TeamKnowledgePanel;
