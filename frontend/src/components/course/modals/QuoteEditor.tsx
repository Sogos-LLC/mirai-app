'use client';

import { useState } from 'react';
import { Quote } from 'lucide-react';

interface QuoteContent {
  text: string;
  author: string;
  title?: string;
  source?: string;
}

interface QuoteEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

export function QuoteEditor({ contentJson, onSave }: QuoteEditorProps) {
  const parsed = JSON.parse(contentJson) as QuoteContent;
  const [text, setText] = useState(parsed.text || '');
  const [author, setAuthor] = useState(parsed.author || '');
  const [title, setTitle] = useState(parsed.title || '');
  const [source, setSource] = useState(parsed.source || '');

  const handleSave = () => {
    onSave(JSON.stringify({
      text,
      author,
      title: title || undefined,
      source: source || undefined,
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Quote Text <span className="text-red-500">*</span>
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted resize-none"
          placeholder="Enter the quote text..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-primary mb-2">
            Author <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full px-4 py-3 bg-surface border border-default rounded-lg
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
              text-primary placeholder:text-muted"
            placeholder="Author name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-primary mb-2">
            Title/Role (optional)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 bg-surface border border-default rounded-lg
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
              text-primary placeholder:text-muted"
            placeholder="e.g., CEO, Author"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Source (optional)
        </label>
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="Book, article, or interview..."
        />
      </div>

      {/* Preview */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Preview
        </label>
        <blockquote className="relative pl-8 pr-4 py-6 bg-slate-50 dark:bg-slate-900/50 border-l-4 border-slate-400 dark:border-slate-600 rounded-r-lg">
          <Quote className="absolute left-2 top-4 w-5 h-5 text-slate-400 dark:text-slate-500" />
          <p className="text-lg italic text-slate-700 dark:text-slate-300 mb-4">
            &ldquo;{text || 'Your quote text will appear here...'}&rdquo;
          </p>
          <footer className="text-sm text-slate-600 dark:text-slate-400">
            <span className="font-medium">— {author || 'Author Name'}</span>
            {title && <span className="text-slate-500">, {title}</span>}
            {source && (
              <cite className="block mt-1 text-xs text-slate-500 not-italic">
                {source}
              </cite>
            )}
          </footer>
        </blockquote>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <button
          onClick={handleSave}
          disabled={!text.trim() || !author.trim()}
          className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg
            hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Done
        </button>
      </div>
    </div>
  );
}
