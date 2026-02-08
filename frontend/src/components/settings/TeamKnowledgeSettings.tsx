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
  Globe,
  Users,
  AlertTriangle,
} from 'lucide-react';
import {
  useListKnowledgeSources,
  useDeleteKnowledgeSource,
  useCheckDuplicateKnowledge,
  computeFileHash,
  getStatusInfo,
  formatFileSize,
  KnowledgeSourceStatus,
  type KnowledgeSource,
  type DuplicateCheckResult,
} from '@/hooks/useTeamKnowledge';
import { KnowledgeUploadModal } from './KnowledgeUploadModal';

// =============================================================================
// Types
// =============================================================================

interface KnowledgeBaseProps {
  /** Optional team ID. If omitted, shows global knowledge (tenant-level). */
  teamId?: string;
  /** Title override for the knowledge base section */
  title?: string;
  /** Description override */
  description?: string;
}

// =============================================================================
// Reusable Knowledge Base Component
// =============================================================================

export function KnowledgeBase({
  teamId,
  title,
  description,
}: KnowledgeBaseProps) {
  const isGlobal = !teamId;
  const defaultTitle = isGlobal ? 'Global Knowledge' : 'Team Knowledge';
  const defaultDescription = isGlobal
    ? 'Shared knowledge base available to all teams for AI-powered course generation'
    : 'Team-specific knowledge base for AI-powered course generation';

  const {
    sources,
    totalSources,
    totalTokens,
    isLoading,
    error,
    refetch,
    hasActiveProcessing,
  } = useListKnowledgeSources(teamId);

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
          {title || defaultTitle}
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
      <StatsCard
        totalSources={totalSources}
        totalTokens={totalTokens}
        isGlobal={isGlobal}
        title={title || defaultTitle}
        description={description || defaultDescription}
      />

      {/* Upload Zone */}
      <UploadZone teamId={teamId} onSuccess={refetch} />

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
                teamId={teamId}
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
            {isGlobal
              ? 'Upload files to build your organization\'s global knowledge base'
              : 'Upload files to build your team\'s knowledge base'}
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component (Global Knowledge for Settings page)
// =============================================================================

export default function TeamKnowledgeSettings() {
  return <KnowledgeBase />;
}

// =============================================================================
// Sub Components
// =============================================================================

interface StatsCardProps {
  totalSources: number;
  totalTokens: bigint;
  isGlobal: boolean;
  title: string;
  description: string;
}

function StatsCard({ totalSources, totalTokens, isGlobal, title, description }: StatsCardProps) {
  const tokenCount = Number(totalTokens);
  const formattedTokens =
    tokenCount >= 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : tokenCount.toString();

  const Icon = isGlobal ? Globe : Users;

  return (
    <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            {title}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {description}
          </p>
        </div>
        <Icon className="w-8 h-8 text-primary-600 dark:text-primary-400 flex-shrink-0" />
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
  teamId?: string;
  onSuccess: () => void;
}

function UploadZone({ teamId, onSuccess }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    file: File;
    hash: string;
    duplicate: DuplicateCheckResult;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { checkDuplicate } = useCheckDuplicateKnowledge();

  const acceptedTypes = ['.txt', '.md'];

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

  const handleFileSelection = useCallback(
    async (file: File) => {
      setUploadError(null);

      const validationError = validateFile(file);
      if (validationError) {
        setUploadError(validationError);
        return;
      }

      try {
        // Compute file hash and check for duplicate
        setIsCheckingDuplicate(true);
        const hash = await computeFileHash(file);

        const duplicateResult = await checkDuplicate(hash);
        setIsCheckingDuplicate(false);

        if (duplicateResult.exists) {
          setDuplicateWarning({ file, hash, duplicate: duplicateResult });
          return;
        }

        // Open modal for upload with progress
        setSelectedFile(file);
      } catch (err) {
        setIsCheckingDuplicate(false);
        if (err instanceof Error) {
          setUploadError(err.message);
        } else {
          setUploadError('Failed to check file. Please try again.');
        }
      }
    },
    [checkDuplicate]
  );

  const handleConfirmDuplicate = useCallback(() => {
    if (!duplicateWarning) return;
    setDuplicateWarning(null);
    // Open modal for upload with progress (skip duplicate check already done)
    setSelectedFile(duplicateWarning.file);
  }, [duplicateWarning]);

  const handleCancelDuplicate = useCallback(() => {
    setDuplicateWarning(null);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedFile(null);
  }, []);

  const handleUploadSuccess = useCallback(() => {
    setSelectedFile(null);
    onSuccess();
  }, [onSuccess]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelection(file);
      }
    },
    [handleFileSelection]
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
        handleFileSelection(file);
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [handleFileSelection]
  );

  return (
    <div className="space-y-2">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isCheckingDuplicate && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragOver
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-300 dark:border-dark-border hover:border-primary-400 dark:hover:border-primary-600'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isCheckingDuplicate}
        />

        <Upload className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
        <p className="font-medium text-gray-900 dark:text-white mb-1">
          Drop files here or click to upload
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Supports {acceptedTypes.join(', ')} files (max 5MB)
        </p>
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {uploadError}
        </div>
      )}

      {/* Duplicate Warning Modal */}
      {duplicateWarning && (
        <DuplicateWarningModal
          fileName={duplicateWarning.file.name}
          existingName={duplicateWarning.duplicate.existingSource?.name || 'Unknown'}
          location={duplicateWarning.duplicate.location || 'Unknown'}
          onConfirm={handleConfirmDuplicate}
          onCancel={handleCancelDuplicate}
        />
      )}

      {/* Upload Progress Modal */}
      {selectedFile && (
        <KnowledgeUploadModal
          file={selectedFile}
          teamId={teamId}
          onClose={handleCloseModal}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}

interface DuplicateWarningModalProps {
  fileName: string;
  existingName: string;
  location: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DuplicateWarningModal({
  fileName,
  existingName,
  location,
  onConfirm,
  onCancel,
}: DuplicateWarningModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
            <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Duplicate File Detected
          </h3>
        </div>

        <p className="text-gray-600 dark:text-gray-400 mb-4">
          A file with the same content already exists in your knowledge base.
        </p>

        <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4 mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">New file:</span>
            <span className="font-medium text-gray-900 dark:text-white">{fileName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Existing file:</span>
            <span className="font-medium text-gray-900 dark:text-white">{existingName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Location:</span>
            <span className="font-medium text-gray-900 dark:text-white">{location}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-50 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-100 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 text-white bg-primary-600 rounded-lg hover:bg-primary-700 font-medium"
          >
            Upload Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

interface SourceRowProps {
  source: KnowledgeSource;
  isLast: boolean;
  onDelete: () => void;
  teamId?: string;
}

function SourceRow({ source, isLast, onDelete, teamId }: SourceRowProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { mutate: deleteSource } = useDeleteKnowledgeSource(teamId);

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
