'use client';

import { useCallback, useEffect } from 'react';
import { FileText, Upload, X, Loader2, CheckCircle, AlertCircle, Globe } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import {
  computeFileHash,
  useUploadKnowledge,
  useDeleteKnowledgeSource,
  useKnowledgeIngestionState,
} from '@/hooks/useTeamKnowledge';

const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.pptx'];
const ACCEPTED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

interface WizardStep4ContextProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep4Context({ context, send }: WizardStep4ContextProps) {
  const uploadKnowledge = useUploadKnowledge();
  const deleteSource = useDeleteKnowledgeSource();

  // Poll ingestion progress while uploading/processing
  const ingestion = useKnowledgeIngestionState(
    context.contextSourceId || null,
    context.contextUploadStatus === 'uploading' || context.contextUploadStatus === 'processing',
  );

  // Transition to ready when ingestion completes
  useEffect(() => {
    if (context.contextUploadStatus === 'processing' && ingestion.stage === 'ready') {
      send({ type: 'CONTEXT_INGESTION_READY' });
    }
    if (context.contextUploadStatus === 'processing' && ingestion.stage === 'failed') {
      send({ type: 'CONTEXT_UPLOAD_ERROR', error: ingestion.errorMessage || 'Ingestion failed' });
    }
  }, [context.contextUploadStatus, ingestion.stage, ingestion.errorMessage, send]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      send({ type: 'SET_CONTEXT_FILE', file, fileName: file.name });
      send({ type: 'CONTEXT_UPLOAD_START' });

      try {
        const hash = await computeFileHash(file);
        const result = await uploadKnowledge.mutate(file, hash);
        const sourceId = result.source?.id;
        if (!sourceId) throw new Error('Upload succeeded but no source ID returned');
        send({ type: 'CONTEXT_UPLOAD_DONE', sourceId });
      } catch (err) {
        send({
          type: 'CONTEXT_UPLOAD_ERROR',
          error: err instanceof Error ? err.message : 'Upload failed',
        });
      }
    },
    [send, uploadKnowledge],
  );

  const handleFileChange = useCallback(
    (file: File | null) => {
      if (!file) {
        // Clean up knowledge source if one was uploaded
        if (context.contextSourceId) {
          deleteSource.mutate(context.contextSourceId).catch(() => {});
        }
        send({ type: 'SET_CONTEXT_FILE', file: null, fileName: '' });
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        send({ type: 'CONTEXT_UPLOAD_ERROR', error: 'File is too large. Maximum size is 20MB.' });
        return;
      }

      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        send({
          type: 'CONTEXT_UPLOAD_ERROR',
          error: `Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`,
        });
        return;
      }

      handleFileUpload(file);
    },
    [send, context.contextSourceId, deleteSource, handleFileUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileChange(file);
    },
    [handleFileChange],
  );

  // Detect URLs in context text
  const detectedUrls = context.contextText.match(URL_REGEX) ?? [];
  const urlCount = detectedUrls.length;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4">
          <FileText className="w-7 h-7 text-violet-600 dark:text-violet-400" />
        </div>
        <h2 className="text-xl font-semibold text-primary mb-2">
          Add Context
          <span className="text-muted font-normal text-base ml-2">(optional)</span>
        </h2>
        <p className="text-sm text-secondary max-w-lg">
          Give the AI extra material to work with — paste text, URLs, or upload a document.
          This step is optional.
        </p>
      </div>

      {/* Text area */}
      <div className="mb-6">
        <label htmlFor="contextText" className="block text-sm font-semibold text-primary mb-2">
          Paste content, notes, or URLs
        </label>
        <textarea
          id="contextText"
          value={context.contextText}
          onChange={(e) => send({ type: 'SET_CONTEXT_TEXT', value: e.target.value })}
          placeholder="Paste any reference material, notes, URLs, or outline you want the AI to incorporate..."
          rows={6}
          className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />

        {/* URL detection indicator */}
        {urlCount > 0 && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <Globe className="w-4 h-4 text-blue-500 shrink-0" />
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {urlCount} URL{urlCount > 1 ? 's' : ''} detected — web research will be used to gather content from {urlCount > 1 ? 'these links' : 'this link'}
            </p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 border-t" />
        <span className="text-xs text-muted">or</span>
        <div className="flex-1 border-t" />
      </div>

      {/* File display / drop zone */}
      {context.contextFileName ? (
        <div className="border rounded-lg p-4 bg-surface">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
              <span className="text-sm font-medium text-primary truncate">{context.contextFileName}</span>
            </div>
            <button
              onClick={() => handleFileChange(null)}
              disabled={context.contextUploadStatus === 'uploading'}
              className="p-2 text-muted hover:text-red-500 rounded-lg hover:bg-hover transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Upload status */}
          {context.contextUploadStatus === 'uploading' && (
            <div className="mt-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
              <span className="text-xs text-secondary">Uploading...</span>
            </div>
          )}
          {context.contextUploadStatus === 'processing' && (
            <div className="mt-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
              <span className="text-xs text-secondary">
                {ingestion.progressMessage || 'Processing document...'}
              </span>
            </div>
          )}
          {context.contextUploadStatus === 'ready' && (
            <div className="mt-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-xs text-green-600 dark:text-green-400">File processed — content will be used for course generation</span>
            </div>
          )}
          {context.contextUploadStatus === 'error' && (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-xs text-red-600 dark:text-red-400">{context.contextUploadError}</span>
              </div>
              <button
                onClick={() => {
                  if (context.contextFile) handleFileUpload(context.contextFile);
                }}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Retry upload
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed rounded-xl p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors cursor-pointer"
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = ACCEPTED_MIME_TYPES.join(',');
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleFileChange(file);
            };
            input.click();
          }}
        >
          <Upload className="w-8 h-8 text-muted mx-auto mb-3" />
          <p className="text-sm font-medium text-primary mb-1">
            Drag & drop a file, or click to browse
          </p>
          <p className="text-xs text-muted">
            Supports: TXT, MD, PDF, DOCX, PPTX (max 20MB)
          </p>
        </div>
      )}
    </div>
  );
}
