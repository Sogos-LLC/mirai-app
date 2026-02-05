'use client';

import React, { useState, useCallback, useRef } from 'react';
import { X, FileText, Check, Upload, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  useListKnowledgeSources,
  formatFileSize,
  KnowledgeSourceStatus,
} from '@/hooks/useTeamKnowledge';
import { KnowledgeUploadModal } from '@/components/settings/KnowledgeUploadModal';

interface KnowledgeSelectionModalProps {
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}

export function KnowledgeSelectionModal({
  selectedIds: initialSelectedIds,
  onConfirm,
  onClose,
}: KnowledgeSelectionModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds));
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // List global knowledge sources (no teamId = tenant-level)
  const { sources, isLoading } = useListKnowledgeSources();

  // Only show READY sources
  const readySources = sources.filter((s) => s.status === KnowledgeSourceStatus.READY);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selected));
  }, [selected, onConfirm]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
    }
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col border">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h2 className="text-base font-semibold text-primary">Select Knowledge Sources</h2>
              <p className="text-xs text-muted mt-0.5">
                Choose documents to inform course generation
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-hover transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-muted animate-spin" />
              </div>
            ) : readySources.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-8 h-8 text-muted mx-auto mb-2" />
                <p className="text-sm text-secondary">No knowledge sources available yet.</p>
                <p className="text-xs text-muted mt-1">Upload a document to get started.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {readySources.map((source) => {
                  const isSelected = selected.has(source.id);
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => toggle(source.id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20'
                          : 'border-subtle bg-page hover:bg-hover'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600'
                              : 'border-subtle'
                          }`}
                        >
                          {isSelected && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <FileText className="w-4 h-4 text-muted shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-primary truncate">
                            {source.name}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted mt-0.5">
                            <span>{formatFileSize(source.fileSizeBytes)}</span>
                            <span>{source.chunkCount} chunks</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.pdf,.docx"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload New
              </Button>
              {selected.size > 0 && (
                <span className="text-xs text-muted">{selected.size} selected</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirm}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Upload modal overlay */}
      {uploadFile && (
        <KnowledgeUploadModal
          file={uploadFile}
          onClose={() => setUploadFile(null)}
          onSuccess={() => setUploadFile(null)}
        />
      )}
    </>
  );
}
