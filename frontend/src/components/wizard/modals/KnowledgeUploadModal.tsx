'use client';

import React, { useCallback, useState } from 'react';
import { Upload, FileText, X, Check, AlertCircle, Paperclip } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import Button from '@/components/ui/Button';

export interface PendingFile {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
}

interface KnowledgeUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: () => void;
  pendingFiles: PendingFile[];
  onAddFiles: (files: PendingFile[]) => void;
  onRemoveFile: (fileId: string) => void;
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
  onUpload,
  pendingFiles,
  onAddFiles,
  onRemoveFile,
}: KnowledgeUploadModalProps) {
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
      const fileArray = Array.from(files);
      const validFiles: PendingFile[] = [];
      const invalidFiles: string[] = [];

      fileArray.forEach((file) => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        const isValidType = SUPPORTED_TYPES.includes(file.type) || SUPPORTED_EXTENSIONS.includes(ext);

        if (isValidType) {
          // Check for duplicates
          const isDuplicate = pendingFiles.some((pf) => pf.name === file.name && pf.size === file.size);
          if (!isDuplicate) {
            validFiles.push({
              id: generateFileId(),
              file,
              name: file.name,
              size: file.size,
              mimeType: file.type || 'application/octet-stream',
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
    [pendingFiles, onAddFiles]
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

  const canUpload = pendingFiles.length > 0;

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
            onClick={onUpload}
            disabled={!canUpload}
          >
            <Paperclip className="w-4 h-4 mr-2" />
            Ready to Upload Knowledge
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
            border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${isDragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-600 bg-surface'}
          `}
        >
          <Upload className="w-10 h-10 mx-auto mb-3 text-muted" />
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

        {/* Pending files list */}
        {pendingFiles.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-primary mb-3">
              Selected Files ({pendingFiles.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pendingFiles.map((pf) => (
                <div
                  key={pf.id}
                  className="flex items-center justify-between p-3 bg-surface-elevated border rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-primary-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{pf.name}</p>
                      <p className="text-xs text-muted">{formatFileSize(pf.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-green-600 flex items-center gap-1 dark:text-green-400">
                      <Check className="w-3 h-3" />
                      Ready
                    </span>
                    <button
                      onClick={() => onRemoveFile(pf.id)}
                      className="p-1.5 rounded hover:bg-hover text-muted hover:text-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm text-muted text-center">
          These documents will be processed and used to enhance AI-generated content.
        </p>
      </div>
    </ResponsiveModal>
  );
}

export default KnowledgeUploadModal;
