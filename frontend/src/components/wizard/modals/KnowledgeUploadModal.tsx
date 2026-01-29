'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Upload, FileText, X, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import Button from '@/components/ui/Button';
import type { ProcessedSource } from './KnowledgeVerificationModal';

export interface PendingFile {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface KnowledgeUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFile: (file: PendingFile) => Promise<ProcessedSource>;
  pendingFiles: PendingFile[];
  onAddFiles: (files: PendingFile[]) => void;
  onRemoveFile: (fileId: string) => void;
  onUpdateFileStatus: (fileId: string, status: PendingFile['status'], error?: string) => void;
  processedSources?: ProcessedSource[];
}

const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'text/plain',
  'text/markdown',
];

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function generateFileId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function KnowledgeUploadModal({
  isOpen,
  onClose,
  onUploadFile,
  pendingFiles,
  onAddFiles,
  onRemoveFile,
  onUpdateFileStatus,
  processedSources = [],
}: KnowledgeUploadModalProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-upload files when they're added with 'pending' status
  useEffect(() => {
    const pendingToUpload = pendingFiles.filter(f => f.status === 'pending');

    pendingToUpload.forEach(async (file) => {
      console.log('[KnowledgeUpload] Starting upload for file:', file.name, 'size:', file.size);
      // Mark as uploading
      onUpdateFileStatus(file.id, 'uploading');

      try {
        console.log('[KnowledgeUpload] Calling onUploadFile...');
        const result = await onUploadFile(file);
        console.log('[KnowledgeUpload] Upload successful:', result);
        onUpdateFileStatus(file.id, 'done');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Upload failed';
        console.error('[KnowledgeUpload] Upload failed:', errorMsg, err);
        onUpdateFileStatus(file.id, 'error', errorMsg);
      }
    });
  }, [pendingFiles, onUploadFile, onUpdateFileStatus]);

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
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const validFiles: PendingFile[] = [];
      const invalidFiles: string[] = [];

      fileArray.forEach((file) => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        const isValidType = SUPPORTED_TYPES.includes(file.type) || SUPPORTED_EXTENSIONS.includes(ext);

        if (isValidType) {
          // Check for duplicates in pending files
          const isDuplicatePending = pendingFiles.some((pf) => pf.name === file.name && pf.size === file.size);
          // Check for duplicates in processed sources
          const isDuplicateProcessed = processedSources.some((ps) => ps.name === file.name);

          if (!isDuplicatePending && !isDuplicateProcessed) {
            validFiles.push({
              id: generateFileId(),
              file,
              name: file.name,
              size: file.size,
              mimeType: file.type || 'application/octet-stream',
              status: 'pending',
            });
          }
        } else {
          invalidFiles.push(file.name);
        }
      });

      if (invalidFiles.length > 0) {
        setError(`Unsupported file types: ${invalidFiles.join(', ')}. Supported: PDF, DOCX, TXT, MD`);
      } else {
        setError(null);
      }

      if (validFiles.length > 0) {
        onAddFiles(validFiles);
      }
    },
    [pendingFiles, processedSources, onAddFiles]
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

  // Check if any files are currently uploading
  const isUploading = pendingFiles.some(f => f.status === 'uploading');
  const hasProcessed = processedSources.length > 0 || pendingFiles.some(f => f.status === 'done');
  const hasPendingOrUploading = pendingFiles.some(f => f.status === 'pending' || f.status === 'uploading');

  // Render file status icon
  const renderFileStatus = (file: PendingFile) => {
    switch (file.status) {
      case 'pending':
      case 'uploading':
        return (
          <span className="text-xs text-primary-600 flex items-center gap-1 dark:text-primary-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing...
          </span>
        );
      case 'done':
        return (
          <span className="text-xs text-green-600 flex items-center gap-1 dark:text-green-400">
            <CheckCircle className="w-3 h-3" />
            Indexed
          </span>
        );
      case 'error':
        return (
          <span className="text-xs text-red-600 flex items-center gap-1 dark:text-red-400" title={file.error}>
            <AlertCircle className="w-3 h-3" />
            Error
          </span>
        );
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Knowledge Sources"
      size="lg"
      mobileHeight="full"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onClose}
            disabled={hasPendingOrUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Done'
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto hover:text-red-900 dark:hover:text-red-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* File upload zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${isDragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-600 bg-surface'}
          `}
        >
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
        </div>

        {/* Already processed sources (from previous sessions) */}
        {processedSources.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-primary mb-3">
              Indexed Documents ({processedSources.length})
            </h3>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {processedSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{source.name}</p>
                      <p className="text-xs text-muted">
                        {source.chunkCount.toLocaleString()} chunks • {source.tokenCount.toLocaleString()} tokens
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0">
                    Indexed
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current files list (pending, uploading, done, error) */}
        {pendingFiles.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-primary mb-3">
              {isUploading ? 'Processing Files...' : 'Files'}
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pendingFiles.map((pf) => (
                <div
                  key={pf.id}
                  className={`flex items-center justify-between p-3 border rounded-lg ${
                    pf.status === 'done'
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                      : pf.status === 'error'
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        : 'bg-surface-elevated border-default'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {pf.status === 'done' ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : pf.status === 'error' ? (
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                    ) : (
                      <FileText className="w-5 h-5 text-primary-600 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{pf.name}</p>
                      <p className="text-xs text-muted">{formatFileSize(pf.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {renderFileStatus(pf)}
                    {(pf.status === 'error' || pf.status === 'done') && (
                      <button
                        onClick={() => onRemoveFile(pf.id)}
                        className="p-1.5 rounded hover:bg-hover text-muted hover:text-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Helper text */}
        <p className="text-sm text-muted text-center">
          {isUploading
            ? 'Files are being processed and indexed for RAG...'
            : hasProcessed
              ? 'Files indexed successfully. Add more files or click Done to continue.'
              : 'Drop files to automatically upload and index them for AI-enhanced content generation.'}
        </p>
      </div>
    </ResponsiveModal>
  );
}

export default KnowledgeUploadModal;
