'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  FileText,
  Upload,
  Trash2,
  AlertCircle,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Database,
  RefreshCw,
} from 'lucide-react';
import {
  useListTeamKnowledgeSources,
  useUploadTeamKnowledge,
  useDeleteTeamKnowledgeSource,
  getStatusInfo,
  formatFileSize,
  KnowledgeSourceStatus,
  type KnowledgeSource,
} from '@/hooks/useTeamKnowledge';

// =============================================================================
// Main Component
// =============================================================================

export default function TeamKnowledgeSettings() {
  const {
    sources,
    totalSources,
    totalTokens,
    isLoading,
    error,
    refetch,
    hasActiveProcessing,
  } = useListTeamKnowledgeSources();

  // Auto-refresh when processing
  useEffect(() => {
    if (!hasActiveProcessing) return;

    const interval = setInterval(() => {
      refetch();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [hasActiveProcessing, refetch]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-dark-50 rounded w-1/3"></div>
        <div className="h-32 bg-gray-200 dark:bg-dark-50 rounded"></div>
        <div className="h-64 bg-gray-200 dark:bg-dark-50 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Failed to load knowledge sources
        </h3>
        <p className="text-gray-600 dark:text-gray-400">Please try again later.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
          Knowledge Base
        </h2>
        {hasActiveProcessing && (
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            <RefreshCw className="w-4 h-4 animate-spin" />
            Processing...
          </button>
        )}
      </div>

      {/* Stats Card */}
      <StatsCard totalSources={totalSources} totalTokens={totalTokens} />

      {/* Upload Zone */}
      <UploadZone onSuccess={refetch} />

      {/* Sources List */}
      {sources.length > 0 ? (
        <div className="mt-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            Uploaded Files ({sources.length})
          </h3>
          <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
            {sources.map((source, idx) => (
              <SourceRow
                key={source.id}
                source={source}
                isLast={idx === sources.length - 1}
                onDelete={refetch}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 text-center py-8 border border-dashed border-gray-300 dark:border-dark-border rounded-xl">
          <Database className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <h3 className="font-medium text-gray-900 dark:text-white mb-1">
            No knowledge sources yet
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Upload files to build your team&apos;s knowledge base
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub Components
// =============================================================================

interface StatsCardProps {
  totalSources: number;
  totalTokens: bigint;
}

function StatsCard({ totalSources, totalTokens }: StatsCardProps) {
  const tokenCount = Number(totalTokens);
  const formattedTokens =
    tokenCount >= 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : tokenCount.toString();

  return (
    <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Team Knowledge
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Shared knowledge base for AI-powered course generation
          </p>
        </div>
        <Database className="w-8 h-8 text-primary-600 dark:text-primary-400 flex-shrink-0" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalSources}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Sources</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formattedTokens}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Tokens Indexed</p>
        </div>
      </div>
    </div>
  );
}

interface UploadZoneProps {
  onSuccess: () => void;
}

function UploadZone({ onSuccess }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate: uploadFile, isLoading: isUploading } = useUploadTeamKnowledge();

  const acceptedTypes = ['.txt', '.md'];
  const acceptedMimeTypes = ['text/plain', 'text/markdown', 'text/x-markdown'];

  const validateFile = (file: File): string | null => {
    // Check extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!acceptedTypes.includes(extension)) {
      return `Invalid file type. Only ${acceptedTypes.join(', ')} files are supported.`;
    }

    // Check size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return 'File too large. Maximum size is 5MB.';
    }

    return null;
  };

  const handleUpload = useCallback(
    async (file: File) => {
      setUploadError(null);

      const validationError = validateFile(file);
      if (validationError) {
        setUploadError(validationError);
        return;
      }

      try {
        await uploadFile(file);
        onSuccess();
      } catch (err) {
        if (err instanceof Error) {
          setUploadError(err.message);
        } else {
          setUploadError('Upload failed. Please try again.');
        }
      }
    },
    [uploadFile, onSuccess]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleUpload(file);
      }
    },
    [handleUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleUpload(file);
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [handleUpload]
  );

  return (
    <div className="space-y-2">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragOver
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-300 dark:border-dark-border hover:border-primary-400 dark:hover:border-primary-600'
        } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />

        {isUploading ? (
          <>
            <Loader2 className="w-10 h-10 text-primary-600 dark:text-primary-400 mx-auto mb-3 animate-spin" />
            <p className="font-medium text-gray-900 dark:text-white">Uploading...</p>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
            <p className="font-medium text-gray-900 dark:text-white mb-1">
              Drop files here or click to upload
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Supports {acceptedTypes.join(', ')} files (max 5MB)
            </p>
          </>
        )}
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {uploadError}
        </div>
      )}
    </div>
  );
}

interface SourceRowProps {
  source: KnowledgeSource;
  isLast: boolean;
  onDelete: () => void;
}

function SourceRow({ source, isLast, onDelete }: SourceRowProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { mutate: deleteSource } = useDeleteTeamKnowledgeSource();

  const statusInfo = getStatusInfo(source.status);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteSource(source.id);
      onDelete();
    } catch (err) {
      console.error('Failed to delete source:', err);
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  // Get status icon
  const StatusIcon =
    source.status === KnowledgeSourceStatus.PENDING
      ? Clock
      : source.status === KnowledgeSourceStatus.PROCESSING
        ? Loader2
        : source.status === KnowledgeSourceStatus.READY
          ? CheckCircle
          : XCircle;

  const isProcessing = source.status === KnowledgeSourceStatus.PROCESSING;

  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 bg-white dark:bg-dark-surface ${
        !isLast ? 'border-b border-gray-100 dark:border-dark-border' : ''
      }`}
    >
      {/* File Icon */}
      <div className="flex-shrink-0">
        <FileText className="w-8 h-8 text-gray-400 dark:text-gray-500" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-white truncate">{source.name}</p>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>{formatFileSize(source.fileSizeBytes)}</span>
          {source.chunkCount > 0 && (
            <>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>{source.chunkCount} chunks</span>
            </>
          )}
          {source.tokenCount && source.tokenCount > 0 && (
            <>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>{source.tokenCount.toLocaleString()} tokens</span>
            </>
          )}
        </div>
        {source.status === KnowledgeSourceStatus.FAILED && source.errorMessage && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1 truncate">
            {source.errorMessage}
          </p>
        )}
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        <StatusIcon
          className={`w-4 h-4 ${statusInfo.color} ${isProcessing ? 'animate-spin' : ''}`}
        />
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color}`}
        >
          {statusInfo.label}
        </span>
      </div>

      {/* Delete Button */}
      {showConfirm ? (
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Confirm'}
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            disabled={isDeleting}
            className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-50 rounded hover:bg-gray-200 dark:hover:bg-dark-100"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowConfirm(true)}
          className="p-2 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-50"
          title="Delete source"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
