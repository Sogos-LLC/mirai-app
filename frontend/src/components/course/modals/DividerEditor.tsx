'use client';

import { useState } from 'react';
import { Minus, MoreHorizontal, Sparkles } from 'lucide-react';

interface DividerContent {
  style?: string;
}

interface DividerEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

const DIVIDER_STYLES = [
  { value: 'default', label: 'Default', icon: Minus },
  { value: 'dotted', label: 'Dotted', icon: MoreHorizontal },
  { value: 'gradient', label: 'Gradient', icon: Sparkles },
];

export function DividerEditor({ contentJson, onSave }: DividerEditorProps) {
  const parsed = JSON.parse(contentJson) as DividerContent;
  const [style, setStyle] = useState(parsed.style || 'default');

  const handleSave = () => {
    onSave(JSON.stringify({
      style: style !== 'default' ? style : undefined,
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Divider Style
        </label>
        <div className="grid grid-cols-3 gap-3">
          {DIVIDER_STYLES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.value}
                onClick={() => setStyle(s.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  style === s.value
                    ? 'bg-purple-100 text-purple-600 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700'
                    : 'bg-hover text-muted border-transparent hover:border-subtle'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="font-medium text-sm">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Preview
        </label>
        <div className="p-8 bg-surface border border-default rounded-lg">
          {style === 'dotted' ? (
            <hr className="border-0 border-t-2 border-dotted border-slate-300 dark:border-slate-600" />
          ) : style === 'gradient' ? (
            <div className="h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent" />
          ) : (
            <hr className="border-slate-200 dark:border-slate-700" />
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg
            hover:bg-purple-700 transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
