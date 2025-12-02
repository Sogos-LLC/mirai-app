'use client';

import { useState, useEffect } from 'react';
import type { SMEKnowledgeChunk } from '@/gen/mirai/v1/sme_pb';

interface KnowledgeChunkEditorProps {
  chunk: SMEKnowledgeChunk;
  onClose: () => void;
  onSave: (data: { chunkId: string; content: string; topic?: string; keywords?: string[] }) => Promise<void>;
  isLoading?: boolean;
}

export function KnowledgeChunkEditor({
  chunk,
  onClose,
  onSave,
  isLoading = false,
}: KnowledgeChunkEditorProps) {
  const [topic, setTopic] = useState(chunk.topic || '');
  const [content, setContent] = useState(chunk.content || '');
  const [keywordsText, setKeywordsText] = useState((chunk.keywords || []).join(', '));
  const [error, setError] = useState<string | null>(null);

  // Focus the content textarea on mount
  useEffect(() => {
    const textarea = document.getElementById('chunk-content');
    if (textarea) {
      textarea.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError('Content is required');
      return;
    }

    // Parse keywords from comma-separated text
    const keywords = keywordsText
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    try {
      await onSave({
        chunkId: chunk.id,
        content: content.trim(),
        topic: topic.trim() || undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Edit Knowledge Chunk</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-4 flex-1 overflow-y-auto space-y-4">
            {/* Topic */}
            <div>
              <label htmlFor="chunk-topic" className="block text-sm font-medium text-gray-700 mb-1">
                Topic
              </label>
              <input
                id="chunk-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Brief topic or title for this knowledge"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>

            {/* Content */}
            <div>
              <label htmlFor="chunk-content" className="block text-sm font-medium text-gray-700 mb-1">
                Content <span className="text-red-500">*</span>
              </label>
              <textarea
                id="chunk-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="The knowledge content..."
                rows={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
              />
              <p className="mt-1 text-xs text-gray-500">
                {content.length} characters
              </p>
            </div>

            {/* Keywords */}
            <div>
              <label htmlFor="chunk-keywords" className="block text-sm font-medium text-gray-700 mb-1">
                Keywords
              </label>
              <input
                id="chunk-keywords"
                type="text"
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder="keyword1, keyword2, keyword3"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Comma-separated list of keywords for search and categorization
              </p>
            </div>

            {/* Metadata (read-only) */}
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Relevance Score: {(chunk.relevanceScore * 100).toFixed(0)}%
                {chunk.createdAt && (
                  <> &bull; Created: {new Date(Number(chunk.createdAt.seconds) * 1000).toLocaleString()}</>
                )}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !content.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
