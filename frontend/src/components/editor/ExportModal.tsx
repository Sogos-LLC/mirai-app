'use client';

import React from 'react';
import { Loader2, Download, Check, AlertCircle } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import type { ExportModalState } from '@/hooks/useExportWorkflow';

interface ExportStatusData {
  progressPercent: number;
  progressMessage?: string;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalState: ExportModalState;
  exportError: string | null;
  exportStatus?: ExportStatusData | null;
  isStarting: boolean;
  isGettingDownload: boolean;
  onStartExport: () => void;
  onDownload: () => void;
  onRetry: () => void;
}

export function ExportModal({
  isOpen,
  onClose,
  modalState,
  exportError,
  exportStatus,
  isStarting,
  isGettingDownload,
  onStartExport,
  onDownload,
  onRetry,
}: ExportModalProps) {
  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        modalState === 'completed' ? "Export Complete!" :
        modalState === 'failed' ? "Export Failed" :
        "Export Course"
      }
      size="md"
      mobileHeight="auto"
    >
      {/* Idle state - initial format selection */}
      {modalState === 'idle' && (
        <>
          <p className="text-secondary mb-6">
            Export your course to SCORM 2004 format for use in your LMS (Docebo compatible).
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 min-h-[44px] border border rounded-lg hover:bg-hover text-secondary"
            >
              Cancel
            </button>
            <button
              onClick={onStartExport}
              disabled={isStarting}
              className="flex-1 px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              Export SCORM
            </button>
          </div>
        </>
      )}

      {/* Starting state - initiating export */}
      {modalState === 'starting' && (
        <div className="text-center py-6">
          <Loader2 className="w-12 h-12 text-purple-600 dark:text-purple-400 animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-primary mb-2">Starting Export...</h3>
          <p className="text-secondary">Preparing your course for export.</p>
        </div>
      )}

      {/* Processing state - export in progress */}
      {modalState === 'processing' && (
        <div className="text-center py-6">
          <Loader2 className="w-12 h-12 text-purple-600 dark:text-purple-400 animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-primary mb-2">Exporting Course...</h3>
          {exportStatus && (
            <>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2 mx-auto max-w-xs">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${exportStatus.progressPercent}%` }}
                />
              </div>
              <p className="text-secondary text-sm">
                {exportStatus.progressMessage || `${exportStatus.progressPercent}% complete`}
              </p>
            </>
          )}
        </div>
      )}

      {/* Completed state - export finished */}
      {modalState === 'completed' && (
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-xl font-semibold text-primary mb-2">Export Complete!</h3>
          <p className="text-secondary mb-6">Your course has been exported successfully.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 min-h-[44px] border border rounded-lg hover:bg-hover text-secondary"
            >
              Close
            </button>
            <button
              onClick={onDownload}
              disabled={isGettingDownload}
              className="flex-1 px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Download size={18} />
              {isGettingDownload ? 'Getting Download...' : 'Download SCORM'}
            </button>
          </div>
        </div>
      )}

      {/* Failed state - export error */}
      {modalState === 'failed' && (
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-xl font-semibold text-primary mb-2">Export Failed</h3>
          <p className="text-secondary mb-6">{exportError}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 min-h-[44px] border border rounded-lg hover:bg-hover text-secondary"
            >
              Close
            </button>
            <button
              onClick={onRetry}
              className="flex-1 px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}
