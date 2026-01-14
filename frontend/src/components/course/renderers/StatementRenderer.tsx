'use client';

import React, { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import type { StatementContent } from '@/gen/mirai/v1/ai_generation_pb';

// Re-export for compatibility
export type { StatementContent };

interface StatementRendererProps {
  content: StatementContent;
  isEditing?: boolean;
  onEdit?: (content: StatementContent) => void;
}

export function StatementRenderer({ content, isEditing = false, onEdit }: StatementRendererProps) {
  const [editContent, setEditContent] = useState(content);

  if (isEditing && onEdit) {
    return (
      <div className="my-8 py-6 px-8 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-l-4 border-indigo-500 rounded-r-lg">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <Lightbulb className="w-5 h-5" />
            <span className="text-sm font-medium">Key Takeaway</span>
          </div>
          <textarea
            value={editContent.text}
            onChange={(e) => {
              const updated = { ...editContent, text: e.target.value };
              setEditContent(updated);
              onEdit(updated);
            }}
            placeholder="Enter the key takeaway..."
            rows={2}
            className="w-full px-3 py-2 text-lg font-semibold text-center bg-white dark:bg-gray-900 border rounded resize-none"
          />
          <input
            type="text"
            value={editContent.subtext || ''}
            onChange={(e) => {
              const updated = { ...editContent, subtext: e.target.value };
              setEditContent(updated);
              onEdit(updated);
            }}
            placeholder="Supporting context (optional)"
            className="w-full px-3 py-2 text-sm text-center bg-white dark:bg-gray-900 border rounded"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="my-8 py-6 px-8 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-l-4 border-indigo-500 rounded-r-lg">
      <div className="flex items-start gap-3">
        <Lightbulb className="w-6 h-6 flex-shrink-0 text-indigo-500 mt-1" />
        <div className="flex-1">
          <p className="text-xl font-semibold text-indigo-900 dark:text-indigo-100">
            {content.text}
          </p>
          {content.subtext && (
            <p className="mt-2 text-sm text-indigo-700 dark:text-indigo-300">
              {content.subtext}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
