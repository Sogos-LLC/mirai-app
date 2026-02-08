'use client';

import React, { useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ListContent } from '@/gen/mirai/v1/component_content_zod';
import { useExternalLinks } from '@/hooks/useExternalLinks';

interface ListRendererProps {
  content: ListContent | Record<string, unknown>;
  isEditing?: boolean;
  onEdit?: (content: ListContent) => void;
}

export function ListRenderer({ content: rawContent, isEditing = false }: ListRendererProps) {
  const content = rawContent as ListContent;
  const [expandedItems, setExpandedItems] = React.useState<Set<number>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);
  const itemsDep = content.items?.map((i) => i.text + (i.description ?? '')).join('') ?? '';
  useExternalLinks(contentRef, itemsDep);

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
              <li key={idx} className="text-primary pl-2" dangerouslySetInnerHTML={{ __html: item.text }} />
            ))}
          </ol>
        );

      case 'icon':
        return (
          <ul className="space-y-3">
            {content.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">{item.icon || '•'}</span>
                <span className="text-primary" dangerouslySetInnerHTML={{ __html: item.text }} />
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
                  <p className="font-medium text-primary" dangerouslySetInnerHTML={{ __html: item.text }} />
                  {item.description && (
                    <p className="mt-1 text-sm text-secondary" dangerouslySetInnerHTML={{ __html: item.description }} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        );

      case 'accordion':
        return (
          <div className="space-y-2">
            {content.items.map((item, idx) => {
              const isExpanded = expandedItems.has(idx);
              return (
                <div
                  key={idx}
                  className={`
                    border rounded-lg overflow-hidden transition-all duration-200
                    ${isExpanded
                      ? 'border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10'
                      : 'border-default bg-surface hover:border-purple-200 dark:hover:border-purple-800'
                    }
                  `}
                >
                  <button
                    onClick={() => toggleItem(idx)}
                    className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors"
                  >
                    <span
                      className={`font-medium ${isExpanded ? 'text-purple-700 dark:text-purple-300' : 'text-primary'}`}
                      dangerouslySetInnerHTML={{ __html: item.text }}
                    />
                    <ChevronDown
                      className={`
                        w-5 h-5 transition-transform duration-200 ease-out flex-shrink-0 ml-2
                        ${isExpanded ? 'rotate-0 text-purple-500' : '-rotate-90 text-muted'}
                      `}
                    />
                  </button>
                  <div
                    className={`
                      grid transition-all duration-200 ease-out
                      ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}
                    `}
                  >
                    <div className="overflow-hidden">
                      {item.description && (
                        <div
                          className="px-4 pb-4 text-secondary text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: item.description }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'bulleted':
      default:
        return (
          <ul className="list-disc list-outside ml-6 space-y-2">
            {content.items.map((item, idx) => (
              <li key={idx} className="text-primary pl-2" dangerouslySetInnerHTML={{ __html: item.text }} />
            ))}
          </ul>
        );
    }
  };

  return (
    <div ref={contentRef} className="my-6">
      {content.title && (
        <h4 className="font-semibold text-primary mb-3">{content.title}</h4>
      )}
      {renderItems()}
    </div>
  );
}
