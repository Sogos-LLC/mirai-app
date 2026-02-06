'use client';

import { useState } from 'react';

export interface TaskListItem {
  id: string;
  contentHtml: string;
}

export interface TaskListContent {
  title: string;
  emoji?: string;
  items: TaskListItem[];
}

interface TaskListRendererProps {
  content: TaskListContent | Record<string, unknown>;
  isEditing?: boolean;
  onEdit?: (content: TaskListContent) => void;
}

export function TaskListRenderer({ content: rawContent }: TaskListRendererProps) {
  const content = rawContent as TaskListContent;
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const completedCount = checkedItems.size;
  const totalCount = content.items?.length ?? 0;

  return (
    <div className="my-6 border-l-4 border-amber-400 dark:border-amber-500 bg-amber-50/50 dark:bg-amber-900/10 rounded-r-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <h4 className="font-semibold text-primary flex items-center gap-2">
          {content.emoji && <span className="text-lg">{content.emoji}</span>}
          {content.title}
        </h4>
        {totalCount > 0 && (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-full">
            {completedCount}/{totalCount}
          </span>
        )}
      </div>

      {/* Items */}
      <div className="px-5 pb-4 space-y-2">
        {content.items?.map((item) => {
          const isChecked = checkedItems.has(item.id);
          return (
            <label
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                isChecked
                  ? 'bg-amber-100/60 dark:bg-amber-900/20'
                  : 'hover:bg-amber-100/40 dark:hover:bg-amber-900/10'
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleItem(item.id)}
                className="mt-1 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 flex-shrink-0"
              />
              <div
                className={`text-sm text-primary leading-relaxed task-list-html ${
                  isChecked ? 'line-through opacity-60' : ''
                }`}
                dangerouslySetInnerHTML={{ __html: item.contentHtml }}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
