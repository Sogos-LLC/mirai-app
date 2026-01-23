'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, Loader2, Check, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  useExportCourse,
  useGetExportStatus,
  useDownloadExport,
  ExportFormat,
  ExportStatus,
} from '@/hooks/useExport';

type ExportState = 'idle' | 'starting' | 'processing' | 'completed' | 'failed';

interface ExportButtonProps {
  courseId: string;
  variant?: 'icon' | 'full';
  className?: string;
}

export function ExportButton({
  courseId,
  variant = 'full',
  className = '',
}: ExportButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportId, setExportId] = useState<string | undefined>(undefined);
  const [exportError, setExportError] = useState<string | null>(null);

  const { mutate: startExport, isLoading: isStarting, error: startError, reset: resetStart } = useExportCourse();
  const { data: exportStatus } = useGetExportStatus(exportId, { enabled: !!exportId });
  const { mutate: getDownload, isLoading: isGettingDownload } = useDownloadExport();

  // Update state based on export status
  useEffect(() => {
    if (!exportStatus) return;

    switch (exportStatus.status) {
      case ExportStatus.PENDING:
      case ExportStatus.PROCESSING:
        setExportState('processing');
        break;
      case ExportStatus.COMPLETED:
        setExportState('completed');
        break;
      case ExportStatus.FAILED:
        setExportState('failed');
        setExportError(exportStatus.errorMessage || 'Export failed. Please try again.');
        break;
    }
  }, [exportStatus]);

  // Handle start error
  useEffect(() => {
    if (startError) {
      setExportState('failed');
      setExportError(startError.message || 'Failed to start export. Please try again.');
    }
  }, [startError]);

  const handleExport = async () => {
    setExportState('starting');
    setExportError(null);
    try {
      const exportRecord = await startExport(courseId, ExportFormat.SCORM_2004);
      if (exportRecord) {
        setExportId(exportRecord.id);
        setExportState('processing');
      }
    } catch {
      // Error handled by useEffect
    }
  };

  const handleDownload = useCallback(async () => {
    if (!exportId) return;
    try {
      const result = await getDownload(exportId);
      if (result.downloadUrl) {
        window.open(result.downloadUrl, '_blank');
      }
    } catch (err) {
      console.error('Failed to get download URL:', err);
    }
  }, [exportId, getDownload]);

  const resetModal = useCallback(() => {
    setExportId(undefined);
    setExportState('idle');
    setExportError(null);
    resetStart();
  }, [resetStart]);

  const handleClose = useCallback(() => {
    setShowModal(false);
    setTimeout(resetModal, 300);
  }, [resetModal]);

  const buttonElement = variant === 'icon' ? (
    <button
      onClick={() => setShowModal(true)}
      className={`p-2 rounded-lg text-secondary hover:text-primary hover:bg-hover transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${className}`}
      title="Export course"
    >
      <Download className="w-5 h-5" />
    </button>
  ) : (
    <Button variant="secondary" size="sm" onClick={() => setShowModal(true)} className={className}>
      <Download className="w-4 h-4 mr-2" />
      Export
    </Button>
  );

  return (
    <>
      {buttonElement}

      <ResponsiveModal
        isOpen={showModal}
        onClose={handleClose}
        title={
          exportState === 'completed' ? "Export Complete!" :
          exportState === 'failed' ? "Export Failed" :
          "Export Course"
        }
        size="md"
        mobileHeight="auto"
      >
        {exportState === 'idle' && (
          <>
            <p className="text-secondary mb-6">
              Export your course to SCORM 2004 format for use in your LMS.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 min-h-[44px] border rounded-lg hover:bg-hover text-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isStarting}
                className="flex-1 px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                Export SCORM
              </button>
            </div>
          </>
        )}

        {exportState === 'starting' && (
          <div className="text-center py-6">
            <Loader2 className="w-12 h-12 text-purple-600 dark:text-purple-400 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-primary mb-2">Starting Export...</h3>
            <p className="text-secondary">Preparing your course for export.</p>
          </div>
        )}

        {exportState === 'processing' && (
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

        {exportState === 'completed' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-primary mb-2">Export Complete!</h3>
            <p className="text-secondary mb-6">Your course has been exported successfully.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 min-h-[44px] border rounded-lg hover:bg-hover text-secondary"
              >
                Close
              </button>
              <button
                onClick={handleDownload}
                disabled={isGettingDownload}
                className="flex-1 px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Download size={18} />
                {isGettingDownload ? 'Getting Download...' : 'Download SCORM'}
              </button>
            </div>
          </div>
        )}

        {exportState === 'failed' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-semibold text-primary mb-2">Export Failed</h3>
            <p className="text-secondary mb-6">{exportError}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 min-h-[44px] border rounded-lg hover:bg-hover text-secondary"
              >
                Close
              </button>
              <button
                onClick={() => {
                  resetModal();
                  handleExport();
                }}
                className="flex-1 px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </ResponsiveModal>
    </>
  );
}
