'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  useExportCourse,
  useGetExportStatus,
  useDownloadExport,
  ExportFormat,
  ExportStatus,
} from '@/hooks/useExport';

export type ExportModalState = 'idle' | 'starting' | 'processing' | 'completed' | 'failed';

interface ExportProgressData {
  progressPercent: number;
  progressMessage?: string;
}

interface UseExportWorkflowReturn {
  showExportModal: boolean;
  exportModalState: ExportModalState;
  exportError: string | null;
  exportProgress: ExportProgressData | null;
  exportId: string | undefined;
  isStarting: boolean;
  isGettingDownload: boolean;
  openExportModal: () => void;
  closeExportModal: () => void;
  startExport: () => Promise<void>;
  downloadExport: () => Promise<void>;
}

/**
 * useExportWorkflow encapsulates the full export lifecycle:
 * start export -> poll status -> download when ready
 */
export function useExportWorkflow(courseId: string): UseExportWorkflowReturn {
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportModalState, setExportModalState] = useState<ExportModalState>('idle');
  const [exportId, setExportId] = useState<string | undefined>(undefined);
  const [exportError, setExportError] = useState<string | null>(null);

  const { mutate: startExportMutation, isLoading: isStarting, error: startError, reset: resetStart } = useExportCourse();
  const { data: exportStatus } = useGetExportStatus(exportId, { enabled: !!exportId });
  const { mutate: getDownload, isLoading: isGettingDownload } = useDownloadExport();

  // Update modal state based on export status
  useEffect(() => {
    if (!exportStatus) return;

    switch (exportStatus.status) {
      case ExportStatus.PENDING:
      case ExportStatus.PROCESSING:
        setExportModalState('processing');
        break;
      case ExportStatus.COMPLETED:
        setExportModalState('completed');
        break;
      case ExportStatus.FAILED:
        setExportModalState('failed');
        setExportError(exportStatus.errorMessage || 'Export failed. Please try again.');
        break;
    }
  }, [exportStatus]);

  // Handle start error
  useEffect(() => {
    if (startError) {
      setExportModalState('failed');
      setExportError(startError.message || 'Failed to start export. Please try again.');
    }
  }, [startError]);

  const handleStartExport = useCallback(async () => {
    setExportModalState('starting');
    setExportError(null);
    try {
      const exportRecord = await startExportMutation(courseId, ExportFormat.SCORM_2004);
      if (exportRecord) {
        setExportId(exportRecord.id);
        setExportModalState('processing');
      }
    } catch {
      // Error handled by useEffect above
    }
  }, [courseId, startExportMutation]);

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

  const resetExportModal = useCallback(() => {
    setExportId(undefined);
    setExportModalState('idle');
    setExportError(null);
    resetStart();
  }, [resetStart]);

  const openExportModal = useCallback(() => {
    setShowExportModal(true);
  }, []);

  const closeExportModal = useCallback(() => {
    setShowExportModal(false);
    setTimeout(resetExportModal, 300);
  }, [resetExportModal]);

  const exportProgress: ExportProgressData | null = exportStatus
    ? { progressPercent: exportStatus.progressPercent, progressMessage: exportStatus.progressMessage }
    : null;

  return {
    showExportModal,
    exportModalState,
    exportError,
    exportProgress,
    exportId,
    isStarting,
    isGettingDownload,
    openExportModal,
    closeExportModal,
    startExport: handleStartExport,
    downloadExport: handleDownload,
  };
}
