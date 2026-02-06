'use client';

import React from 'react';
import { Quote } from 'lucide-react';
import type { QuoteContent } from '@/gen/mirai/v1/component_content_zod';

interface QuoteRendererProps {
  content: QuoteContent | Record<string, unknown>;
  isEditing?: boolean;
  onEdit?: (content: QuoteContent) => void;
}

export function QuoteRenderer({ content: rawContent, isEditing = false }: QuoteRendererProps) {
  const content = rawContent as QuoteContent;
  return (
    <blockquote className="my-8 relative pl-8 pr-4 py-6 bg-slate-50 dark:bg-slate-900/50 border-l-4 border-slate-400 dark:border-slate-600 rounded-r-lg">
      <Quote className="absolute left-2 top-4 w-5 h-5 text-slate-400 dark:text-slate-500" />
      <p className="text-lg italic text-slate-700 dark:text-slate-300 mb-4">
        &ldquo;{content.text}&rdquo;
      </p>
      <footer className="text-sm text-slate-600 dark:text-slate-400">
        <span className="font-medium">— {content.author}</span>
        {content.title && (
          <span className="text-slate-500 dark:text-slate-500">, {content.title}</span>
        )}
        {content.source && (
          <cite className="block mt-1 text-xs text-slate-500 dark:text-slate-500 not-italic">
            {content.source}
          </cite>
        )}
      </footer>
    </blockquote>
  );
}
