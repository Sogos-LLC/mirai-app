'use client';

import React from 'react';
import { Loader2, CheckCircle } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import Button from '@/components/ui/Button';
import { FileUploadZone } from '@/components/knowledge/FileUploadZone';
import { useFileAutoUpload } from '@/components/knowledge/useFileUpload';
import type { PendingFile } from '@/components/knowledge/fileUploadUtils';
import type { ProcessedSource } from './KnowledgeVerificationModal';

// Re-export PendingFile for backwards compatibility
export type { PendingFile } from '@/components/knowledge/fileUploadUtils';

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
  // Auto-upload files when they're added with 'pending' status
  useFileAutoUpload(pendingFiles, onUploadFile, onUpdateFileStatus);

  const isUploading = pendingFiles.some(f => f.status === 'uploading');
  const hasProcessed = processedSources.length > 0 || pendingFiles.some(f => f.status === 'done');
  const hasPendingOrUploading = pendingFiles.some(f => f.status === 'pending' || f.status === 'uploading');

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
        <FileUploadZone
          pendingFiles={pendingFiles}
          onAddFiles={onAddFiles}
          onRemoveFile={onRemoveFile}
          existingSourceNames={processedSources.map(s => s.name)}
        />

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
