'use client';

import { useState, useCallback } from 'react';
import { Bold, Italic, Link, List, ListOrdered } from 'lucide-react';
import type { TextContent } from '@/gen/mirai/v1/component_content_zod';

interface TextEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

export function TextEditor({ contentJson, onSave }: TextEditorProps) {
  const parsed = JSON.parse(contentJson) as TextContent;
  const [content, setContent] = useState(parsed.textHtml?.replace(/<[^>]*>/g, '') || '');

  // Simple markdown-like formatting helpers
  const wrapSelection = useCallback((prefix: string, suffix: string) => {
    const textarea = document.getElementById('text-editor-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    const newText =
      content.substring(0, start) +
      prefix +
      selectedText +
      suffix +
      content.substring(end);

    setContent(newText);

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        end + prefix.length
      );
    }, 0);
  }, [content]);

  const handleBold = () => wrapSelection('**', '**');
  const handleItalic = () => wrapSelection('*', '*');
  const handleLink = () => wrapSelection('[', '](url)');

  const insertAtCursor = useCallback((text: string) => {
    const textarea = document.getElementById('text-editor-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const newText =
      content.substring(0, start) +
      text +
      content.substring(start);

    setContent(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }, [content]);

  const handleBulletList = () => insertAtCursor('\n- ');
  const handleNumberedList = () => insertAtCursor('\n1. ');

  const handleSave = () => {
    // Convert markdown-like syntax to simple HTML
    let html = content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .split('\n')
      .map(p => p.trim() ? `<p>${p}</p>` : '')
      .join('');

    onSave(JSON.stringify({ textHtml: html }));
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 bg-hover rounded-lg border border-subtle">
        <button
          onClick={handleBold}
          className="p-2 text-secondary hover:text-primary hover:bg-active rounded transition-colors"
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={handleItalic}
          className="p-2 text-secondary hover:text-primary hover:bg-active rounded transition-colors"
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={handleLink}
          className="p-2 text-secondary hover:text-primary hover:bg-active rounded transition-colors"
          title="Link"
        >
          <Link className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-subtle mx-1" />
        <button
          onClick={handleBulletList}
          className="p-2 text-secondary hover:text-primary hover:bg-active rounded transition-colors"
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={handleNumberedList}
          className="p-2 text-secondary hover:text-primary hover:bg-active rounded transition-colors"
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
      </div>

      {/* Editor */}
      <div>
        <textarea
          id="text-editor-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted resize-none"
          placeholder="Enter text content..."
        />
        <p className="mt-2 text-xs text-muted">
          Supports **bold**, *italic*, [links](url), and list formatting.
        </p>
      </div>

      {/* Preview */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Preview
        </label>
        <div className="p-4 bg-hover rounded-lg prose prose-sm max-w-none text-secondary">
          {content.split('\n').map((paragraph, i) => (
            <p key={i} className="mb-2 last:mb-0">
              {paragraph
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .split(/(<[^>]+>.*?<\/[^>]+>)/)
                .map((part, j) => {
                  if (part.startsWith('<strong>')) {
                    return <strong key={j}>{part.replace(/<\/?strong>/g, '')}</strong>;
                  }
                  if (part.startsWith('<em>')) {
                    return <em key={j}>{part.replace(/<\/?em>/g, '')}</em>;
                  }
                  return part;
                })
              }
            </p>
          ))}
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
