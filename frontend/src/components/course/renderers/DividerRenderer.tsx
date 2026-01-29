'use client';

import React from 'react';

export interface DividerContent {
  style?: string; // Reserved for future styling options
}

interface DividerRendererProps {
  content: DividerContent | Record<string, unknown>;
  isEditing?: boolean;
  onEdit?: (content: DividerContent) => void;
}

export function DividerRenderer({ content: rawContent, isEditing = false }: DividerRendererProps) {
  const content = rawContent as DividerContent;
  return (
    <hr className="my-8 border-0 h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent" />
  );
}
