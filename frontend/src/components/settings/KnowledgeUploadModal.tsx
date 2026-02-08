'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  FileText,
  Upload,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  BookOpen,
  Layers,
  Hash,
  FileType,
  HardDrive,
} from 'lucide-react';
import {
  useUploadKnowledge,
  useGetTeamKnowledgeSource,
  useKnowledgeIngestionState,
  computeFileHash,
  formatFileSize,
} from '@/hooks/useTeamKnowledge';
import { renderMarkdownHtml } from '@/components/knowledge/fileUploadUtils';

// =============================================================================
// Types
// =============================================================================

type ProcessingStage =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'decrypting'
  | 'reading'
  | 'chunking'
  | 'analyzing'
  | 'finalizing'
  | 'ready'
  | 'failed';

interface KnowledgeUploadModalProps {
  /** File to upload */
  file: File;
  /** Optional team ID. If omitted, uploads to global knowledge. */
  teamId?: string;
  /** Called when modal is closed (Save or Cancel) */
  onClose: () => void;
  /** Called when upload completes successfully */
  onSuccess: () => void;
}

interface ProcessingStep {
  stage: ProcessingStage;
  label: string;
  description: string;
}

// =============================================================================
// Constants
// =============================================================================

const PROCESSING_STEPS: ProcessingStep[] = [
  { stage: 'uploading', label: 'Uploading', description: 'Transferring file to server' },
  { stage: 'reading', label: 'Reading', description: 'Extracting text content' },
  { stage: 'chunking', label: 'Chunking', description: 'Splitting into semantic chunks & embedding' },
  { stage: 'analyzing', label: 'Analyzing', description: 'Generating document summary' },
  { stage: 'finalizing', label: 'Finalizing', description: 'Saving to knowledge base' },
];

// Map workflow stages to display step stages
function mapToDisplayStage(stage: string): ProcessingStage {
  switch (stage) {
    case 'pending':
      return 'pending';
    case 'processing':
    case 'decrypting':
      return 'uploading'; // Combine early stages into "uploading" display
    case 'reading':
      return 'reading';
    case 'chunking':
      return 'chunking';
    case 'analyzing':
      return 'analyzing';
    case 'finalizing':
      return 'finalizing';
    case 'ready':
      return 'ready';
    case 'failed':
      return 'failed';
    default:
      return 'processing';
  }
}

// =============================================================================
// Main Component
// =============================================================================

export function KnowledgeUploadModal({
  file,
  teamId,
  onClose,
  onSuccess,
}: KnowledgeUploadModalProps) {
  // State
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [showContentPreview, setShowContentPreview] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Hooks
  const { mutate: uploadFile, isLoading: isUploading } = useUploadKnowledge(teamId);
  const { data: source, refetch: refetchSource } = useGetTeamKnowledgeSource(sourceId || undefined);

  // Real progress from Temporal workflow
  const ingestionState = useKnowledgeIngestionState(
    sourceId,
    uploadComplete && !uploadError,
  );

  // Refetch source data when ingestion completes (stats are stale from initial fetch)
  useEffect(() => {
    if (ingestionState.stage === 'ready' && sourceId) {
      refetchSource();
    }
  }, [ingestionState.stage, sourceId, refetchSource]);

  // Derive current stage from workflow state
  const currentStage: ProcessingStage = uploadError
    ? 'failed'
    : !uploadComplete
      ? isUploading
        ? 'uploading'
        : 'pending'
      : ingestionState.stage === 'ready'
        ? 'ready'
        : ingestionState.stage === 'failed'
          ? 'failed'
          : mapToDisplayStage(ingestionState.stage);

  const error = uploadError || (ingestionState.stage === 'failed' ? ingestionState.errorMessage : null);

  // Read file preview on mount
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFilePreview(content.slice(0, 500));
    };
    reader.readAsText(file.slice(0, 1000));
  }, [file]);

  // Handle upload — enforce a minimum 5s "uploading" state so the modal
  // doesn't flash when the upload completes near-instantly.
  const handleUpload = useCallback(async () => {
    setUploadError(null);
    setUploadComplete(false);

    const minDisplayMs = 5000;
    const delay = new Promise((r) => setTimeout(r, minDisplayMs));

    try {
      const [result] = await Promise.all([
        computeFileHash(file).then((hash) => uploadFile(file, hash)),
        delay,
      ]);
      const newSourceId = result.source?.id || null;
      setSourceId(newSourceId);
      setUploadComplete(true);
    } catch (err) {
      if (err instanceof Error) {
        setUploadError(err.message);
      } else {
        setUploadError('Upload failed. Please try again.');
      }
    }
  }, [file, uploadFile]);

  // Auto-start upload when modal opens
  useEffect(() => {
    handleUpload();
  }, []);

  // Handle save (confirm)
  const handleSave = useCallback(() => {
    onSuccess();
    onClose();
  }, [onSuccess, onClose]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setUploadError(null);
    setSourceId(null);
    setUploadComplete(false);
    handleUpload();
  }, [handleUpload]);

  // Get file type label
  const getFileTypeLabel = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'md':
        return 'Markdown';
      case 'txt':
        return 'Plain Text';
      case 'pdf':
        return 'PDF Document';
      case 'docx':
        return 'Word Document';
      default:
        return ext?.toUpperCase() || 'Unknown';
    }
  };

  const isProcessing = currentStage !== 'pending' && currentStage !== 'ready' && currentStage !== 'failed';
  const isComplete = currentStage === 'ready';
  const isFailed = currentStage === 'failed';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <Upload className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isComplete ? 'Upload Complete' : isProcessing ? 'Processing Document' : isFailed ? 'Upload Failed' : 'Uploading'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isComplete
                  ? 'Document is ready for use'
                  : isProcessing
                    ? ingestionState.progressMessage || 'This may take a moment'
                    : isFailed
                      ? 'An error occurred'
                      : 'Starting upload'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* File Confirmation Section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
              File Information
            </h3>
            <div className="bg-gray-50 dark:bg-dark-50 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <FileText className="w-10 h-10 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <FileType className="w-3.5 h-3.5" />
                      {getFileTypeLabel(file.name)}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5" />
                      {formatFileSize(BigInt(file.size))}
                    </span>
                  </div>
                </div>
                {/* Status Badge */}
                <div className="flex-shrink-0">
                  {isComplete && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Ready
                    </span>
                  )}
                  {isProcessing && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Processing
                    </span>
                  )}
                  {isFailed && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <XCircle className="w-3.5 h-3.5" />
                      Failed
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Processing Status Section */}
          {(isProcessing || isComplete) && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
                Processing Status
              </h3>
              <div className="bg-gray-50 dark:bg-dark-50 rounded-xl p-4">
                {/* Progress bar */}
                {isProcessing && ingestionState.progressPercent > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>{ingestionState.progressMessage}</span>
                      <span>{ingestionState.progressPercent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-dark-100 rounded-full h-2">
                      <div
                        className="bg-primary-600 dark:bg-primary-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${ingestionState.progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  {PROCESSING_STEPS.map((step) => {
                    const displayStage = currentStage;
                    const stepStages: ProcessingStage[] = ['uploading', 'reading', 'chunking', 'analyzing', 'finalizing'];
                    const currentIdx = stepStages.indexOf(displayStage);
                    const stepIdx = stepStages.indexOf(step.stage);
                    const isStepComplete = isComplete || stepIdx < currentIdx;
                    const isStepActive = step.stage === displayStage;

                    return (
                      <div key={step.stage} className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isStepComplete
                              ? 'bg-green-100 dark:bg-green-900/30'
                              : isStepActive
                                ? 'bg-blue-100 dark:bg-blue-900/30'
                                : 'bg-gray-200 dark:bg-dark-100'
                          }`}
                        >
                          {isStepComplete ? (
                            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                          ) : isStepActive ? (
                            <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p
                            className={`font-medium ${
                              isStepComplete || isStepActive
                                ? 'text-gray-900 dark:text-white'
                                : 'text-gray-400 dark:text-gray-500'
                            }`}
                          >
                            {step.label}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{step.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Error Section */}
          {isFailed && error && (
            <section>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800 dark:text-red-300">Processing Failed</p>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Knowledge Base Metadata (when ready) */}
          {isComplete && source && (
            <>
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
                  Document Analysis
                </h3>
                <div className="bg-gray-50 dark:bg-dark-50 rounded-xl p-4 space-y-4">
                  {/* Title */}
                  {source.documentIndex?.title && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Detected Title
                      </label>
                      <p className="text-gray-900 dark:text-white font-medium">
                        {source.documentIndex.title}
                      </p>
                    </div>
                  )}

                  {/* Summary */}
                  {source.summary && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        AI Summary
                      </label>
                      <p className="text-gray-700 dark:text-gray-300 text-sm">{source.summary}</p>
                    </div>
                  )}

                  {/* Main Topics */}
                  {source.documentIndex?.mainTopics && source.documentIndex.mainTopics.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                        Main Topics
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {source.documentIndex.mainTopics.map((topic, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-lg text-xs font-medium"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Concepts */}
                  {source.documentIndex?.keyConcepts && source.documentIndex.keyConcepts.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                        Key Concepts
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {source.documentIndex.keyConcepts.map((concept, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 bg-gray-200 dark:bg-dark-100 text-gray-700 dark:text-gray-300 rounded-lg text-xs"
                          >
                            {concept}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Chunking Hints */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
                  Chunking Statistics
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 dark:bg-dark-50 rounded-xl p-4 text-center">
                    <Layers className="w-6 h-6 text-primary-600 dark:text-primary-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {source.chunkCount}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Chunks</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-dark-50 rounded-xl p-4 text-center">
                    <Hash className="w-6 h-6 text-primary-600 dark:text-primary-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {source.tokenCount?.toLocaleString() || '—'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Tokens</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-dark-50 rounded-xl p-4 text-center">
                    <BookOpen className="w-6 h-6 text-primary-600 dark:text-primary-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {source.documentIndex?.estimatedLessonCount || '—'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Est. Lessons</p>
                  </div>
                </div>
              </section>

              {/* Content Preview */}
              <section>
                <button
                  onClick={() => setShowContentPreview(!showContentPreview)}
                  className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3"
                >
                  <span>Content Preview</span>
                  {showContentPreview ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                {showContentPreview && filePreview && (
                  <div className="bg-gray-50 dark:bg-dark-50 rounded-xl p-4">
                    {file.name.endsWith('.md') ? (
                      <div
                        className="text-sm text-gray-700 dark:text-gray-300 overflow-x-auto [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1 [&_strong]:font-bold [&_em]:italic [&_code]:bg-gray-200 [&_code]:dark:bg-dark-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_li]:ml-4 [&_li]:list-disc [&_hr]:my-2 [&_hr]:border-gray-300 [&_hr]:dark:border-dark-border"
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdownHtml(filePreview) +
                            (filePreview.length >= 500 ? '<span style="opacity:0.5">...</span>' : ''),
                        }}
                      />
                    ) : (
                      <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono overflow-x-auto">
                        {filePreview}
                        {filePreview.length >= 500 && (
                          <span className="text-gray-400 dark:text-gray-500">...</span>
                        )}
                      </pre>
                    )}
                  </div>
                )}
              </section>

              {/* Content Depth */}
              {source.documentIndex?.contentDepth && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
                    Content Assessment
                  </h3>
                  <div className="bg-gray-50 dark:bg-dark-50 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Content Depth:</span>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize ${
                          source.documentIndex.contentDepth === 'advanced'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                            : source.documentIndex.contentDepth === 'intermediate'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        }`}
                      >
                        {source.documentIndex.contentDepth}
                      </span>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-50">
          {isFailed ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-100 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleRetry}
                className="px-4 py-2 text-white bg-primary-600 rounded-lg hover:bg-primary-700 font-medium flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Upload
              </button>
            </>
          ) : isComplete ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-100 font-medium"
              >
                Close
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-white bg-primary-600 rounded-lg hover:bg-primary-700 font-medium flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Done
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-100 font-medium"
            >
              Cancel Upload
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default KnowledgeUploadModal;
