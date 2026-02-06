'use client';

import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import type { StatementContent } from '@/gen/mirai/v1/component_content_zod';

interface StatementEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

export function StatementEditor({ contentJson, onSave }: StatementEditorProps) {
  const parsed = JSON.parse(contentJson) as StatementContent;
  const [text, setText] = useState(parsed.statementText || '');
  const [subtext, setSubtext] = useState(parsed.statementSubtext || '');

  const handleSave = () => {
    onSave(JSON.stringify({
      statementText: text,
      statementSubtext: subtext || undefined,
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Key Takeaway <span className="text-red-500">*</span>
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted resize-none"
          placeholder="The key concept learners should remember..."
        />
        <p className="mt-1 text-xs text-muted">
          1-2 sentences max. Make it memorable and quotable.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Supporting Context (optional)
        </label>
        <input
          type="text"
          value={subtext}
          onChange={(e) => setSubtext(e.target.value)}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="Brief additional context..."
        />
      </div>

      {/* Preview */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Preview
        </label>
        <div className="py-6 px-8 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 border-l-4 border-indigo-500 rounded-r-lg">
          <div className="flex items-start gap-3 justify-center">
            <Lightbulb className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="text-center">
              <p className="text-xl font-semibold text-indigo-900 dark:text-indigo-100">
                {text || 'Your key takeaway will appear here...'}
              </p>
              {subtext && (
                <p className="mt-2 text-sm text-indigo-700 dark:text-indigo-300">
                  {subtext}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <button
          onClick={handleSave}
          disabled={!text.trim()}
          className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg
            hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Done
        </button>
      </div>
    </div>
  );
}
