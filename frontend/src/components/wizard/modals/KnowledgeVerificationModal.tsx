'use client';

import React from 'react';
import { CheckCircle, FileText, Database } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import Button from '@/components/ui/Button';

export interface ProcessedSource {
  id: string;
  name: string;
  summary: string;
  chunkCount: number;
  tokenCount: number;
}

interface KnowledgeVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: ProcessedSource[];
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function KnowledgeVerificationModal({
  isOpen,
  onClose,
  sources,
}: KnowledgeVerificationModalProps) {
  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Knowledge Ready"
      size="lg"
      mobileHeight="full"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Success message */}
        <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div>
            <p className="font-medium text-green-800 dark:text-green-200">
              Your documents have been processed and are ready to use.
            </p>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              The AI can now use this knowledge when generating course content.
            </p>
          </div>
        </div>

        {/* Processed sources */}
        <div className="space-y-4">
          {sources.map((source) => (
            <div
              key={source.id}
              className="p-4 bg-surface-elevated border rounded-lg"
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />
                <h4 className="font-medium text-primary truncate">
                  {source.name}
                </h4>
              </div>

              {/* Summary */}
              <div className="pl-8">
                <p className="text-sm text-secondary leading-relaxed mb-3">
                  &ldquo;{source.summary}&rdquo;
                </p>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <Database className="w-3.5 h-3.5" />
                    Indexed: {formatNumber(source.chunkCount)} chunks
                  </span>
                  <span>|</span>
                  <span>{formatNumber(source.tokenCount)} tokens</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Info note */}
        <p className="text-sm text-muted text-center">
          Click &quot;Generate&quot; on desired course outcomes to see RAG in action.
        </p>
      </div>
    </ResponsiveModal>
  );
}

export default KnowledgeVerificationModal;
