'use client';

import { useState } from 'react';
import type { HeadingContent } from '@/gen/mirai/v1/component_content_zod';

interface HeadingEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

export function HeadingEditor({ contentJson, onSave }: HeadingEditorProps) {
  const parsed = JSON.parse(contentJson) as HeadingContent;
  const [level, setLevel] = useState(parsed.headingLevel || 2);
  const [text, setText] = useState(parsed.headingText || '');

  const handleSave = () => {
    onSave(JSON.stringify({ headingLevel: level, headingText: text }));
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Heading Level
        </label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6].map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                level === l
                  ? 'bg-purple-600 text-white'
                  : 'bg-hover text-secondary hover:bg-active'
              }`}
            >
              H{l}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Heading Text
        </label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="Enter heading text..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Preview
        </label>
        <div className="p-4 bg-hover rounded-lg">
          {level === 1 && <h1 className="text-3xl font-bold text-primary">{text || 'Heading preview'}</h1>}
          {level === 2 && <h2 className="text-2xl font-bold text-primary">{text || 'Heading preview'}</h2>}
          {level === 3 && <h3 className="text-xl font-bold text-primary">{text || 'Heading preview'}</h3>}
          {level === 4 && <h4 className="text-lg font-bold text-primary">{text || 'Heading preview'}</h4>}
          {level === 5 && <h5 className="text-base font-bold text-primary">{text || 'Heading preview'}</h5>}
          {level === 6 && <h6 className="text-sm font-bold text-primary">{text || 'Heading preview'}</h6>}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg
            hover:bg-purple-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
