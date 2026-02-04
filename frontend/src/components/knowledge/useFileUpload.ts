'use client';

import { useEffect, useRef } from 'react';
import type { PendingFile } from './fileUploadUtils';

/**
 * useFileAutoUpload automatically processes pending files sequentially.
 * When files are added with status 'pending', this hook triggers the upload
 * and updates status to 'uploading' -> 'done' or 'error'.
 */
export function useFileAutoUpload(
  pendingFiles: PendingFile[],
  onUploadFile: (file: PendingFile) => Promise<unknown>,
  onUpdateFileStatus: (fileId: string, status: PendingFile['status'], error?: string) => void,
) {
  const processingRef = useRef<Set<string>>(new Set());

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
}
