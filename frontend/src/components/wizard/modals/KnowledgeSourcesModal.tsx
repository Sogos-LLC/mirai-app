'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
  Library,
  Globe,
  Check,
  Search,
  FolderOpen,
} from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import Button from '@/components/ui/Button';
import type { ProcessedSource } from './KnowledgeVerificationModal';
import type { WizardKnowledgeSource } from '@/machines/courseWizardMachine';

export interface PendingFile {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface KnowledgeSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Existing sources
  teamDocs: WizardKnowledgeSource[];
  globalDocs: WizardKnowledgeSource[];
  selectedTeamDocIds: string[];
  selectedGlobalDocIds: string[];
  onToggleTeamDoc: (docId: string) => void;
  onToggleGlobalDoc: (docId: string) => void;
  onSelectAllTeamDocs: () => void;
  onDeselectAllTeamDocs: () => void;
  onSelectAllGlobalDocs: () => void;
  onDeselectAllGlobalDocs: () => void;
  // File uploads
  onUploadFile: (file: PendingFile) => Promise<ProcessedSource>;
  pendingFiles: PendingFile[];
  onAddFiles: (files: PendingFile[]) => void;
  onRemoveFile: (fileId: string) => void;
  onUpdateFileStatus: (fileId: string, status: PendingFile['status'], error?: string) => void;
  processedSources?: ProcessedSource[];
}

type TabType = 'existing' | 'upload';

const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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

function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens} tokens`;
  return `~${Math.round(tokens / 1000)}k tokens`;
}

function generateFileId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function KnowledgeSourcesModal({
  isOpen,
  onClose,
  teamDocs,
  globalDocs,
  selectedTeamDocIds,
  selectedGlobalDocIds,
  onToggleTeamDoc,
  onToggleGlobalDoc,
  onSelectAllTeamDocs,
  onDeselectAllTeamDocs,
  onSelectAllGlobalDocs,
  onDeselectAllGlobalDocs,
  onUploadFile,
  pendingFiles,
  onAddFiles,
  onRemoveFile,
  onUpdateFileStatus,
  processedSources = [],
}: KnowledgeSourcesModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('existing');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const processingRef = useRef<Set<string>>(new Set());

  const hasTeamDocs = teamDocs.length > 0;
  const hasGlobalDocs = globalDocs.length > 0;
  const hasExistingSources = hasTeamDocs || hasGlobalDocs;

  // Switch to upload tab if no existing sources
  useEffect(() => {
    if (isOpen && !hasExistingSources) {
      setActiveTab('upload');
    }
  }, [isOpen, hasExistingSources]);

  // Calculate totals
  const selectedTeamTokens = teamDocs
    .filter((doc) => selectedTeamDocIds.includes(doc.id))
    .reduce((sum, doc) => sum + doc.tokenCount, 0);

  const selectedGlobalTokens = globalDocs
    .filter((doc) => selectedGlobalDocIds.includes(doc.id))
    .reduce((sum, doc) => sum + doc.tokenCount, 0);

  const totalSelectedTokens = selectedTeamTokens + selectedGlobalTokens;
  const totalSelectedDocs = selectedTeamDocIds.length + selectedGlobalDocIds.length;
  const totalUploadedDocs = processedSources.length + pendingFiles.filter(f => f.status === 'done').length;

  // Filter sources by search query
  const filteredTeamDocs = teamDocs.filter(
    (doc) =>
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.summary?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGlobalDocs = globalDocs.filter(
    (doc) =>
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.summary?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Auto-upload files when they're added with 'pending' status
  useEffect(() => {
    const uploadPendingFiles = async () => {
      const pendingToUpload = pendingFiles.filter(
        (f) => f.status === 'pending' && !processingRef.current.has(f.id)
      );

      for (const file of pendingToUpload) {
        processingRef.current.add(file.id);
        onUpdateFileStatus(file.id, 'uploading');

        try {
          await onUploadFile(file);
          onUpdateFileStatus(file.id, 'done');
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Upload failed';
          onUpdateFileStatus(file.id, 'error', errorMsg);
        } finally {
          processingRef.current.delete(file.id);
        }
      }
    };

    uploadPendingFiles();
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
          const isDuplicatePending = pendingFiles.some((pf) => pf.name === file.name && pf.size === file.size);
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
        setUploadError(`Unsupported file types: ${invalidFiles.join(', ')}. Supported: PDF, DOCX, TXT, MD`);
      } else {
        setUploadError(null);
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
        e.target.value = '';
      }
    },
    [processFiles]
  );

  const isUploading = pendingFiles.some((f) => f.status === 'uploading');

  const renderSourceItem = (
    doc: WizardKnowledgeSource,
    isSelected: boolean,
    onToggle: () => void,
    scope: 'team' | 'global'
  ) => (
    <button
      key={doc.id}
      onClick={onToggle}
      className={`
        w-full p-4 rounded-lg border-2 text-left transition-all
        ${
          isSelected
            ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
            : 'border-transparent bg-surface hover:border-gray-300 dark:hover:border-gray-600'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <div
          className={`
            w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5
            ${isSelected ? 'bg-primary-600 border-primary-600' : 'border-gray-300 dark:border-gray-600'}
          `}
        >
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-primary truncate">{doc.name}</p>
            {scope === 'global' && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                Global
              </span>
            )}
          </div>
          {doc.summary && <p className="text-sm text-muted line-clamp-2 mt-1">{doc.summary}</p>}
          <p className="text-xs text-muted mt-2">{formatTokenCount(doc.tokenCount)}</p>
        </div>
      </div>
    </button>
  );

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
      title="Knowledge Sources"
      size="2xl"
      mobileHeight="full"
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted">
            {totalSelectedDocs > 0 && (
              <span>
                {totalSelectedDocs} source{totalSelectedDocs !== 1 ? 's' : ''} selected
                {totalSelectedTokens > 0 && ` • ${formatTokenCount(totalSelectedTokens)}`}
              </span>
            )}
            {totalUploadedDocs > 0 && totalSelectedDocs > 0 && ' • '}
            {totalUploadedDocs > 0 && (
              <span>
                {totalUploadedDocs} file{totalUploadedDocs !== 1 ? 's' : ''} uploaded
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onClose} disabled={isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                'Apply Selection'
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('existing')}
            className={`
              px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
              ${
                activeTab === 'existing'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-muted hover:text-primary'
              }
            `}
          >
            <div className="flex items-center gap-2">
              <Library className="w-4 h-4" />
              Existing Sources
              {hasExistingSources && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-elevated">
                  {teamDocs.length + globalDocs.length}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`
              px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
              ${
                activeTab === 'upload'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-muted hover:text-primary'
              }
            `}
          >
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload Files
              {(processedSources.length > 0 || pendingFiles.length > 0) && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-elevated">
                  {processedSources.length + pendingFiles.length}
                </span>
              )}
            </div>
          </button>
        </div>

        {/* Existing Sources Tab */}
        {activeTab === 'existing' && (
          <div className="space-y-4">
            {/* Empty state */}
            {!hasExistingSources && (
              <div className="text-center py-12 px-4">
                <FolderOpen className="w-12 h-12 mx-auto text-muted mb-4" />
                <h3 className="text-lg font-medium text-primary mb-2">No Knowledge Sources Available</h3>
                <p className="text-sm text-muted max-w-md mx-auto mb-4">
                  Your organization hasn&apos;t uploaded any knowledge sources yet. Upload files to create
                  course content grounded in your own documents.
                </p>
                <Button variant="secondary" onClick={() => setActiveTab('upload')}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Files
                </Button>
              </div>
            )}

            {/* Search */}
            {hasExistingSources && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  placeholder="Search knowledge sources..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border rounded-lg outline-none transition-all
                    bg-white dark:bg-dark-400
                    border-gray-300 dark:border-dark-border-input
                    text-gray-900 dark:text-dark-text
                    placeholder:text-gray-400 dark:placeholder:text-dark-text-muted
                    focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400
                    focus:border-transparent"
                />
              </div>
            )}

            {/* Summary Bar */}
            {totalSelectedDocs > 0 && (
              <div className="p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-primary-800 dark:text-primary-200">
                    {totalSelectedDocs} document{totalSelectedDocs !== 1 ? 's' : ''} selected
                  </span>
                  <span className="text-sm text-primary-700 dark:text-primary-300">
                    {formatTokenCount(totalSelectedTokens)} of context
                  </span>
                </div>
              </div>
            )}

            {/* Team Knowledge Section */}
            {hasTeamDocs && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Library className="w-4 h-4 text-muted" />
                    <h3 className="text-sm font-semibold text-primary">Team Knowledge</h3>
                    <span className="text-xs text-muted">
                      ({filteredTeamDocs.length} document{filteredTeamDocs.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <button
                    onClick={
                      selectedTeamDocIds.length === teamDocs.length ? onDeselectAllTeamDocs : onSelectAllTeamDocs
                    }
                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                  >
                    {selectedTeamDocIds.length === teamDocs.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredTeamDocs.map((doc) =>
                    renderSourceItem(doc, selectedTeamDocIds.includes(doc.id), () => onToggleTeamDoc(doc.id), 'team')
                  )}
                  {filteredTeamDocs.length === 0 && searchQuery && (
                    <p className="text-sm text-muted text-center py-4">No team documents match your search</p>
                  )}
                </div>
              </div>
            )}

            {/* Global Knowledge Section */}
            {hasGlobalDocs && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-muted" />
                    <h3 className="text-sm font-semibold text-primary">Global Knowledge</h3>
                    <span className="text-xs text-muted">
                      ({filteredGlobalDocs.length} document{filteredGlobalDocs.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <button
                    onClick={
                      selectedGlobalDocIds.length === globalDocs.length
                        ? onDeselectAllGlobalDocs
                        : onSelectAllGlobalDocs
                    }
                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                  >
                    {selectedGlobalDocIds.length === globalDocs.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredGlobalDocs.map((doc) =>
                    renderSourceItem(
                      doc,
                      selectedGlobalDocIds.includes(doc.id),
                      () => onToggleGlobalDoc(doc.id),
                      'global'
                    )
                  )}
                  {filteredGlobalDocs.length === 0 && searchQuery && (
                    <p className="text-sm text-muted text-center py-4">No global documents match your search</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            {/* Error message */}
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

            {/* File upload zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-colors
                ${
                  isDragOver
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-300 dark:border-gray-600 bg-surface'
                }
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
              <p className="text-sm text-muted">Supported formats: PDF, DOCX, TXT, Markdown</p>
            </div>

            {/* Already processed sources */}
            {processedSources.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-primary mb-3">
                  Indexed Documents ({processedSources.length})
                </h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
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
                      <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0">Indexed</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current files list */}
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
                : processedSources.length > 0 || pendingFiles.some((f) => f.status === 'done')
                  ? 'Files indexed successfully. Add more files or switch to Existing Sources.'
                  : 'Upload files to create course content grounded in your documents.'}
            </p>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

export default KnowledgeSourcesModal;
