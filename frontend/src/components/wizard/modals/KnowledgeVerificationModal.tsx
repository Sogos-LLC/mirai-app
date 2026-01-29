'use client';

import React, { useMemo } from 'react';
import { CheckCircle, FileText, Database, Layers, Plus, ArrowRight } from 'lucide-react';
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
  onAddMore: () => void;
  sources: ProcessedSource[];
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function KnowledgeVerificationModal({
  isOpen,
  onClose,
  onAddMore,
  sources,
}: KnowledgeVerificationModalProps) {
  // Calculate aggregate stats
  const totalStats = useMemo(() => {
    return sources.reduce(
      (acc, source) => ({
        chunks: acc.chunks + source.chunkCount,
        tokens: acc.tokens + source.tokenCount,
      }),
      { chunks: 0, tokens: 0 }
    );
  }, [sources]);

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Knowledge Sources Report"
      size="lg"
      mobileHeight="full"
      footer={
        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <Button variant="secondary" onClick={onAddMore}>
            <Plus className="w-4 h-4 mr-2" />
            Add More Files
          </Button>
          <Button variant="primary" onClick={onClose}>
            Continue with Wizard
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Success banner */}
        <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div>
            <p className="font-medium text-green-800 dark:text-green-200">
              {sources.length} document{sources.length !== 1 ? 's' : ''} processed successfully!
            </p>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              This knowledge will be used to generate more accurate and relevant course content.
            </p>
          </div>
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-surface-elevated border rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 text-primary mb-1">
              <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <span className="text-2xl font-bold">{sources.length}</span>
            </div>
            <p className="text-xs text-muted">Documents</p>
          </div>
          <div className="p-4 bg-surface-elevated border rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 text-primary mb-1">
              <Layers className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <span className="text-2xl font-bold">{formatNumber(totalStats.chunks)}</span>
            </div>
            <p className="text-xs text-muted">Indexed Chunks</p>
          </div>
          <div className="p-4 bg-surface-elevated border rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 text-primary mb-1">
              <Database className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <span className="text-2xl font-bold">{formatNumber(totalStats.tokens)}</span>
            </div>
            <p className="text-xs text-muted">Total Tokens</p>
          </div>
        </div>

        {/* Document summaries */}
        <div>
          <h3 className="text-sm font-semibold text-primary mb-3">Document Summaries</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {sources.map((source) => (
              <div
                key={source.id}
                className="p-4 bg-surface-elevated border rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-primary text-sm truncate mb-1">
                      {source.name}
                    </h4>
                    <p className="text-sm text-secondary leading-relaxed">
                      {source.summary}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                      <span>{formatNumber(source.chunkCount)} chunks</span>
                      <span>•</span>
                      <span>{formatNumber(source.tokenCount)} tokens</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Help text */}
        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <p className="text-sm text-indigo-800 dark:text-indigo-200">
            <strong>What happens next?</strong> When you click &quot;Generate&quot; for course outcomes,
            the AI will search these documents for relevant information and use it to create
            better, more accurate content with citations.
          </p>
        </div>
      </div>
    </ResponsiveModal>
  );
}

export default KnowledgeVerificationModal;
