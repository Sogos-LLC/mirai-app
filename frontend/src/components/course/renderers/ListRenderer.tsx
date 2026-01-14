'use client';

import React from 'react';
import { CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';

export interface ListItem {
  text: string;
  icon?: string;
  description?: string;
}

export interface ListContent {
  style: string; // bulleted, numbered, icon, process, accordion
  items: ListItem[];
  title?: string;
}

interface ListRendererProps {
  content: ListContent | Record<string, unknown>;
  isEditing?: boolean;
  onEdit?: (content: ListContent) => void;
}

export function ListRenderer({ content: rawContent, isEditing = false }: ListRendererProps) {
  const content = rawContent as ListContent;
  const [expandedItems, setExpandedItems] = React.useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const renderItems = () => {
    switch (content.style) {
      case 'numbered':
        return (
          <ol className="list-decimal list-outside ml-6 space-y-2">
            {content.items.map((item, idx) => (
              <li key={idx} className="text-primary pl-2">
                {item.text}
              </li>
            ))}
          </ol>
        );

      case 'icon':
        return (
          <ul className="space-y-3">
            {content.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">{item.icon || '•'}</span>
                <span className="text-primary">{item.text}</span>
              </li>
            ))}
          </ul>
        );

      case 'process':
        return (
          <ol className="space-y-4">
            {content.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center font-semibold text-sm">
                  {idx + 1}
                </div>
                <div className="flex-1 pt-1">
                  <p className="font-medium text-primary">{item.text}</p>
                  {item.description && (
                    <p className="mt-1 text-sm text-secondary">{item.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        );

      case 'accordion':
        return (
          <div className="space-y-2 border border-default rounded-lg overflow-hidden">
            {content.items.map((item, idx) => (
              <div key={idx} className="border-b border-default last:border-b-0">
                <button
                  onClick={() => toggleItem(idx)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-hover transition-colors"
                >
                  <span className="font-medium text-primary">{item.text}</span>
                  {expandedItems.has(idx) ? (
                    <ChevronDown className="w-5 h-5 text-muted" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted" />
                  )}
                </button>
                {expandedItems.has(idx) && item.description && (
                  <div className="px-4 pb-3 text-secondary">
                    {item.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        );

      case 'bulleted':
      default:
        return (
          <ul className="list-disc list-outside ml-6 space-y-2">
            {content.items.map((item, idx) => (
              <li key={idx} className="text-primary pl-2">
                {item.text}
              </li>
            ))}
          </ul>
        );
    }
  };

  return (
    <div className="my-6">
      {content.title && (
        <h4 className="font-semibold text-primary mb-3">{content.title}</h4>
      )}
      {renderItems()}
    </div>
  );
}
