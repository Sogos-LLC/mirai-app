'use client';

import React, { useState } from 'react';
import { Info, AlertTriangle, CheckCircle, XCircle, Lightbulb } from 'lucide-react';
import { CalloutStyle } from '@/gen/mirai/v1/ai_generation_pb';
import type { CalloutContent } from '@/gen/mirai/v1/ai_generation_zod';

// Re-export for compatibility
export type { CalloutContent };

// Callout style enum values from proto
const CALLOUT_STYLES = {
  UNSPECIFIED: CalloutStyle.UNSPECIFIED,
  INFO: CalloutStyle.INFO,
  WARNING: CalloutStyle.WARNING,
  SUCCESS: CalloutStyle.SUCCESS,
  ERROR: CalloutStyle.ERROR,
  TIP: CalloutStyle.TIP,
} as const;

export type CalloutStyleValue = (typeof CALLOUT_STYLES)[keyof typeof CALLOUT_STYLES];

interface CalloutRendererProps {
  content: CalloutContent;
  isEditing?: boolean;
  onEdit?: (content: CalloutContent) => void;
}

const styleConfig: Record<
  CalloutStyleValue,
  {
    icon: React.ComponentType<{ className?: string }>;
    bgColor: string;
    borderColor: string;
    textColor: string;
    iconColor: string;
    label: string;
  }
> = {
  [CALLOUT_STYLES.UNSPECIFIED]: {
    icon: Info,
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-300',
    textColor: 'text-gray-800',
    iconColor: 'text-gray-600',
    label: 'Note',
  },
  [CALLOUT_STYLES.INFO]: {
    icon: Info,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    textColor: 'text-blue-800',
    iconColor: 'text-blue-600',
    label: 'Info',
  },
  [CALLOUT_STYLES.WARNING]: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-400',
    textColor: 'text-yellow-800',
    iconColor: 'text-yellow-600',
    label: 'Warning',
  },
  [CALLOUT_STYLES.SUCCESS]: {
    icon: CheckCircle,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    textColor: 'text-green-800',
    iconColor: 'text-green-600',
    label: 'Success',
  },
  [CALLOUT_STYLES.ERROR]: {
    icon: XCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    textColor: 'text-red-800',
    iconColor: 'text-red-600',
    label: 'Error',
  },
  [CALLOUT_STYLES.TIP]: {
    icon: Lightbulb,
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    textColor: 'text-purple-800',
    iconColor: 'text-purple-600',
    label: 'Tip',
  },
};

export function CalloutRenderer({ content, isEditing = false, onEdit }: CalloutRendererProps) {
  const [editContent, setEditContent] = useState(content);

  const config = styleConfig[content.style] || styleConfig[CALLOUT_STYLES.INFO];
  const Icon = config.icon;

  if (isEditing && onEdit) {
    return (
      <div className={`p-4 rounded-lg border-l-4 ${config.bgColor} ${config.borderColor}`}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select
              value={editContent.style}
              onChange={(e) => {
                const updated = { ...editContent, style: Number(e.target.value) as CalloutStyleValue };
                setEditContent(updated);
                onEdit(updated);
              }}
              className="text-sm bg-transparent border rounded px-2 py-1"
            >
              <option value={CALLOUT_STYLES.INFO}>Info</option>
              <option value={CALLOUT_STYLES.WARNING}>Warning</option>
              <option value={CALLOUT_STYLES.SUCCESS}>Success</option>
              <option value={CALLOUT_STYLES.ERROR}>Error</option>
              <option value={CALLOUT_STYLES.TIP}>Tip</option>
            </select>
          </div>
          <input
            type="text"
            value={editContent.title || ''}
            onChange={(e) => {
              const updated = { ...editContent, title: e.target.value };
              setEditContent(updated);
              onEdit(updated);
            }}
            placeholder="Title (optional)"
            className="w-full px-3 py-2 text-sm bg-white border rounded"
          />
          <textarea
            value={editContent.content}
            onChange={(e) => {
              const updated = { ...editContent, content: e.target.value };
              setEditContent(updated);
              onEdit(updated);
            }}
            placeholder="Callout content..."
            rows={3}
            className="w-full px-3 py-2 text-sm bg-white border rounded resize-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg border-l-4 ${config.bgColor} ${config.borderColor}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          {content.title && (
            <h4 className={`font-semibold mb-1 ${config.textColor}`}>{content.title}</h4>
          )}
          <p className={`text-sm ${config.textColor}`}>{content.content}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Get label for callout style
 */
export function getCalloutStyleLabel(style: CalloutStyleValue): string {
  return styleConfig[style]?.label || 'Note';
}
