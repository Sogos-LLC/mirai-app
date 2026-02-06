'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { TaskListContent, TaskListItem } from '@/gen/mirai/v1/component_content_zod';

interface TaskListEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

export function TaskListEditor({ contentJson, onSave }: TaskListEditorProps) {
  const parsed = JSON.parse(contentJson) as TaskListContent;
  const [title, setTitle] = useState(parsed.title || '');
  const [emoji, setEmoji] = useState(parsed.emoji || '');
  const [items, setItems] = useState<TaskListItem[]>(
    parsed.items?.length
      ? parsed.items
      : [{ id: 'a', contentHtml: '' }]
  );

  const nextId = () => {
    const used = new Set(items.map((i) => i.id));
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    for (const ch of letters) {
      if (!used.has(ch)) return ch;
    }
    return `item-${items.length + 1}`;
  };

  const handleSave = () => {
    onSave(
      JSON.stringify({
        title: title || 'Practice Time',
        emoji: emoji || undefined,
        items: items.filter((item) => item.contentHtml.trim()),
      })
    );
  };

  const addItem = () => {
    setItems([...items, { id: nextId(), contentHtml: '' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, contentHtml: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], contentHtml };
    setItems(updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <div className="w-20">
          <label className="block text-sm font-medium text-primary mb-2">
            Emoji
          </label>
          <input
            type="text"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="w-full px-3 py-3 bg-surface border border-default rounded-lg
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
              text-primary placeholder:text-muted text-center text-lg"
            placeholder="✏️"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-primary mb-2">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 bg-surface border border-default rounded-lg
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
              text-primary placeholder:text-muted"
            placeholder="Practice Time"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Task Items
        </label>
        <p className="text-xs text-muted mb-3">
          Supports HTML: &lt;code&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;p&gt;, &lt;ol&gt;, &lt;li&gt;
        </p>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item.id} className="flex gap-2 items-start">
              <div className="flex-shrink-0 pt-3 text-muted">
                <GripVertical className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <textarea
                  value={item.contentHtml}
                  onChange={(e) => updateItem(index, e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 bg-surface border border-default rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                    text-primary placeholder:text-muted resize-none text-sm"
                  placeholder={`Task ${index + 1} — e.g., Open your terminal and run <code>npm init</code>`}
                />
              </div>
              <button
                onClick={() => removeItem(index)}
                disabled={items.length <= 1}
                className="pt-2 p-2 text-muted hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addItem}
          className="mt-3 flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <button
          onClick={handleSave}
          disabled={!title.trim() && items.every((item) => !item.contentHtml.trim())}
          className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg
            hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Done
        </button>
      </div>
    </div>
  );
}
