'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import {
  type PendingFile,
  SUPPORTED_ACCEPT,
  formatFileSize,
  validateFiles,
} from './fileUploadUtils';

interface FileUploadZoneProps {
  pendingFiles: PendingFile[];
  onAddFiles: (files: PendingFile[]) => void;
  onRemoveFile: (fileId: string) => void;
  /** Names of already-processed sources to detect duplicates */
  existingSourceNames?: string[];
  /** Whether to show the file list below the drop zone */
  showFileList?: boolean;
  /** Custom label for the processed sources section */
  processedLabel?: string;
}

export function FileUploadZone({
  pendingFiles,
  onAddFiles,
  onRemoveFile,
  existingSourceNames = [],
  showFileList = true,
  processedLabel = 'Files',
}: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const existingNames = new Set([
        ...existingSourceNames,
        ...pendingFiles.map((f) => f.name),
      ]);
      const { valid, invalidNames } = validateFiles(Array.from(files), existingNames);

      if (invalidNames.length > 0) {
        setError(`Unsupported file types: ${invalidNames.join(', ')}. Supported: PDF, DOCX, TXT, MD`);
      } else {
        setError(null);
      }

      if (valid.length > 0) {
        onAddFiles(valid);
      }
    },
    [pendingFiles, existingSourceNames, onAddFiles]
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
        e.target.value = '';
      }
    },
    [processFiles]
  );

  const isUploading = pendingFiles.some((f) => f.status === 'uploading');

  return (
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

      {/* Drop zone */}
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
              accept={SUPPORTED_ACCEPT}
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
        </p>
        <p className="text-sm text-muted">Supported: PDF, DOCX, TXT, Markdown</p>
      </div>

      {/* File list */}
      {showFileList && pendingFiles.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-primary mb-3">
            {isUploading ? 'Processing Files...' : processedLabel}
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {pendingFiles.map((pf) => (
              <FileStatusRow key={pf.id} file={pf} onRemove={() => onRemoveFile(pf.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FileStatusRow({ file, onRemove }: { file: PendingFile; onRemove: () => void }) {
  return (
    <div
      className={`flex items-center justify-between p-3 border rounded-lg ${
        file.status === 'done'
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : file.status === 'error'
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : 'bg-surface-elevated border-default'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {file.status === 'done' ? (
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
        ) : file.status === 'error' ? (
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
        ) : (
          <FileText className="w-5 h-5 text-primary-600 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary truncate">{file.name}</p>
          <p className="text-xs text-muted">{formatFileSize(file.size)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <FileStatusBadge status={file.status} error={file.error} />
        {(file.status === 'error' || file.status === 'done') && (
          <button
            onClick={onRemove}
            className="p-1.5 rounded hover:bg-hover text-muted hover:text-red-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function FileStatusBadge({ status, error }: { status: PendingFile['status']; error?: string }) {
  switch (status) {
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
        <span className="text-xs text-red-600 flex items-center gap-1 dark:text-red-400" title={error}>
          <AlertCircle className="w-3 h-3" />
          Error
        </span>
      );
  }
}
