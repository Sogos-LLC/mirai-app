'use client';

import { useState } from 'react';
import { Info, AlertTriangle, CheckCircle, XCircle, Lightbulb } from 'lucide-react';
import { CalloutStyle } from '@/gen/mirai/v1/ai_generation_pb';

interface CalloutContent {
  style: number;
  title?: string;
  content: string;
}

interface CalloutEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

const CALLOUT_STYLES = [
  { value: CalloutStyle.INFO, label: 'Info', icon: Info, color: 'bg-blue-100 text-blue-600 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700' },
  { value: CalloutStyle.WARNING, label: 'Warning', icon: AlertTriangle, color: 'bg-yellow-100 text-yellow-600 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700' },
  { value: CalloutStyle.SUCCESS, label: 'Success', icon: CheckCircle, color: 'bg-green-100 text-green-600 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' },
  { value: CalloutStyle.ERROR, label: 'Error', icon: XCircle, color: 'bg-red-100 text-red-600 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700' },
  { value: CalloutStyle.TIP, label: 'Tip', icon: Lightbulb, color: 'bg-purple-100 text-purple-600 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700' },
];

export function CalloutEditor({ contentJson, onSave }: CalloutEditorProps) {
  const parsed = JSON.parse(contentJson) as CalloutContent;
  const [style, setStyle] = useState(parsed.style || CalloutStyle.INFO);
  const [title, setTitle] = useState(parsed.title || '');
  const [content, setContent] = useState(parsed.content || '');

  const handleSave = () => {
    onSave(JSON.stringify({
      style,
      title: title || undefined,
      content,
    }));
  };

  const selectedStyle = CALLOUT_STYLES.find((s) => s.value === style) || CALLOUT_STYLES[0];

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Callout Type
        </label>
        <div className="grid grid-cols-5 gap-2">
          {CALLOUT_STYLES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.value}
                onClick={() => setStyle(s.value)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                  style === s.value
                    ? s.color + ' border-current'
                    : 'bg-hover text-muted border-transparent hover:border-subtle'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Title (optional)
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="Callout title..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted resize-none"
          placeholder="Callout content..."
        />
      </div>

      {/* Preview */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Preview
        </label>
        <div className={`p-4 rounded-lg border ${selectedStyle.color}`}>
          <div className="flex items-start gap-3">
            <selectedStyle.icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              {title && <p className="font-semibold mb-1">{title}</p>}
              <p>{content || 'Callout content preview...'}</p>
            </div>
          </div>
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
