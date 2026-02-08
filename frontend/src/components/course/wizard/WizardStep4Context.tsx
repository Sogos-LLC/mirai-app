'use client';

import { useCallback } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';

const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.pptx'];
const ACCEPTED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

interface WizardStep4ContextProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep4Context({ context, send }: WizardStep4ContextProps) {
  const handleFileChange = useCallback(
    (file: File | null) => {
      if (!file) {
        send({ type: 'SET_CONTEXT_FILE', file: null, fileName: '' });
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        alert('File is too large. Maximum size is 20MB.');
        return;
      }

      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        alert(`Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`);
        return;
      }

      send({ type: 'SET_CONTEXT_FILE', file, fileName: file.name });
    },
    [send]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileChange(file);
    },
    [handleFileChange]
  );

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
          Give the AI extra material to work with — paste text or upload a document.
          This step is optional.
        </p>
      </div>

      {/* Text area */}
      <div className="mb-6">
        <label htmlFor="contextText" className="block text-sm font-semibold text-primary mb-2">
          Paste content or notes
        </label>
        <textarea
          id="contextText"
          value={context.contextText}
          onChange={(e) => send({ type: 'SET_CONTEXT_TEXT', value: e.target.value })}
          placeholder="Paste any reference material, notes, or outline you want the AI to incorporate..."
          rows={6}
          className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 border-t" />
        <span className="text-xs text-muted">or</span>
        <div className="flex-1 border-t" />
      </div>

      {/* File drop zone */}
      {context.contextFileName ? (
        <div className="border rounded-lg p-4 bg-surface flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-indigo-500" />
            <span className="text-sm font-medium text-primary">{context.contextFileName}</span>
          </div>
          <button
            onClick={() => send({ type: 'SET_CONTEXT_FILE', file: null, fileName: '' })}
            className="p-2 text-muted hover:text-red-500 rounded-lg hover:bg-hover transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Remove file"
          >
            <X className="w-4 h-4" />
          </button>
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
