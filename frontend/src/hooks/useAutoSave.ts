'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  debounceMs?: number;
  savedDisplayMs?: number;
}

interface UseAutoSaveReturn {
  saveStatus: SaveStatus;
  triggerSave: () => void;
}

/**
 * useAutoSave provides debounced auto-save with status tracking.
 *
 * @param hasChanges - Whether there are unsaved changes
 * @param isSaving - Whether a save is currently in progress (external)
 * @param saveFn - Async function to perform the save
 * @param options - Configuration options
 */
export function useAutoSave(
  hasChanges: boolean,
  isSaving: boolean,
  saveFn: () => Promise<void>,
  options: UseAutoSaveOptions = {},
): UseAutoSaveReturn {
  const { debounceMs = 1500, savedDisplayMs = 2000 } = options;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveStatusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveFnRef = useRef(saveFn);

  // Keep ref in sync
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const executeSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await saveFnRef.current();
      setSaveStatus('saved');

      if (saveStatusTimerRef.current) {
        clearTimeout(saveStatusTimerRef.current);
      }
      saveStatusTimerRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, savedDisplayMs);
    } catch (error) {
      console.error('Auto-save failed:', error);
      setSaveStatus('error');
    }
  }, [savedDisplayMs]);

  // Auto-save effect
  useEffect(() => {
    if (!hasChanges || isSaving) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(executeSave, debounceMs);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [hasChanges, isSaving, debounceMs, executeSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  return {
    saveStatus,
    triggerSave: executeSave,
  };
}
