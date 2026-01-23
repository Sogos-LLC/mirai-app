'use client';

import React, { useCallback, useState } from 'react';
import { Upload, FileText, X, Check, Loader2, BookOpen, AlertCircle, Cloud, Building2 } from 'lucide-react';
import {
  SiGoogledrive,
  SiAmazons3,
  SiGooglesheets,
} from 'react-icons/si';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import WizardNavigation from '../WizardNavigation';

export interface PendingFile {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
}

interface KnowledgeSourcesStepProps {
  pendingFiles: PendingFile[];
  onAddFiles: (files: PendingFile[]) => void;
  onRemoveFile: (fileId: string) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'text/plain',
  'text/markdown',
];

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

const comingSoonIntegrations = [
  { id: 'google-drive', name: 'Google Drive', icon: SiGoogledrive, color: '#4285F4' },
  { id: 'onedrive', name: 'OneDrive', icon: Cloud, color: '#0078D4' },
  { id: 's3', name: 'Amazon S3', icon: SiAmazons3, color: '#FF9900' },
  { id: 'google-sheets', name: 'Google Sheets', icon: SiGooglesheets, color: '#0F9D58' },
  { id: 'microsoft-365', name: 'Microsoft 365', icon: Building2, color: '#D83B01' },
];

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

export default function KnowledgeSourcesStep({
  pendingFiles,
  onAddFiles,
  onRemoveFile,
  onNext,
  onSkip,
  onBack,
  onCancel,
  isLoading = false,
}: KnowledgeSourcesStepProps) {
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

  const canProceed = pendingFiles.length > 0;

  return (
    <Card>
      <CardContent className="py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-primary">Add Knowledge Sources</h2>
                <p className="text-sm sm:text-base text-secondary">
                  Upload documents to provide context for course generation (optional)
                </p>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto hover:text-red-900">
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
              border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-6
              ${isDragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-300 bg-surface'}
            `}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted" />
            <p className="text-primary font-medium mb-1">
              Drag and drop files here, or{' '}
              <label className="text-primary-600 hover:text-primary-700 cursor-pointer underline">
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
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-primary mb-3">
                Selected Files ({pendingFiles.length})
              </h3>
              <div className="space-y-2">
                {pendingFiles.map((pf) => (
                  <div
                    key={pf.id}
                    className="flex items-center justify-between p-3 bg-surface-elevated border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-primary-600" />
                      <div>
                        <p className="text-sm font-medium text-primary">{pf.name}</p>
                        <p className="text-xs text-muted">{formatFileSize(pf.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Ready
                      </span>
                      <button
                        onClick={() => onRemoveFile(pf.id)}
                        className="p-1.5 rounded hover:bg-hover text-muted hover:text-red-600 transition-colors"
                        disabled={isLoading}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coming soon integrations */}
          <div className="p-4 bg-surface-elevated border rounded-lg">
            <p className="text-sm text-muted mb-3">More integrations coming soon</p>
            <div className="flex flex-wrap gap-2">
              {comingSoonIntegrations.map((integration) => {
                const Icon = integration.icon;
                return (
                  <div
                    key={integration.id}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-300 rounded-lg opacity-60 cursor-not-allowed"
                  >
                    <Icon className="w-4 h-4" style={{ color: integration.color }} />
                    <span className="text-sm text-muted">{integration.name}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-dark-400 rounded text-muted">
                      Soon
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-sm text-muted text-center mt-4">
            Knowledge sources are optional. You can skip this step and add them later.
          </p>
        </div>

        <WizardNavigation
          onBack={onBack}
          onNext={canProceed ? onNext : onSkip}
          onCancel={onCancel}
          canGoBack={true}
          canGoNext={true}
          isLoading={isLoading}
          nextLabel={canProceed ? 'Continue' : 'Skip'}
        />
      </CardContent>
    </Card>
  );
}
