'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, Loader2, Check, AlertCircle, FileText, Package } from 'lucide-react';
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

function formatLabel(format: ExportFormat | null): string {
  switch (format) {
    case ExportFormat.PDF:
      return 'PDF';
    case ExportFormat.SCORM_2004:
      return 'SCORM 2004';
    default:
      return 'Export';
  }
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
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);

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

  const handleExport = async (format: ExportFormat) => {
    setExportState('starting');
    setExportError(null);
    setSelectedFormat(format);
    try {
      const exportRecord = await startExport(courseId, format);
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
    setSelectedFormat(null);
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
            <p className="text-secondary mb-4">
              Choose an export format for your course.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => handleExport(ExportFormat.PDF)}
                disabled={isStarting}
                className="flex flex-col items-center gap-2 p-4 min-h-[44px] border rounded-lg hover:bg-hover hover:border-purple-400 transition-colors group"
              >
                <FileText className="w-8 h-8 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-primary">PDF</span>
                <span className="text-xs text-muted text-center">Shareable document</span>
              </button>
              <button
                onClick={() => handleExport(ExportFormat.SCORM_2004)}
                disabled={isStarting}
                className="flex flex-col items-center gap-2 p-4 min-h-[44px] border rounded-lg hover:bg-hover hover:border-purple-400 transition-colors group"
              >
                <Package className="w-8 h-8 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-primary">SCORM 2004</span>
                <span className="text-xs text-muted text-center">LMS-compatible</span>
              </button>
            </div>
            <button
              onClick={handleClose}
              className="w-full px-4 py-2 min-h-[44px] border rounded-lg hover:bg-hover text-secondary"
            >
              Cancel
            </button>
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
                {isGettingDownload ? 'Getting Download...' : `Download ${formatLabel(selectedFormat)}`}
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
