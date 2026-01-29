'use client';

import React, { useState } from 'react';
import { Info, AlertTriangle, CheckCircle, XCircle, Lightbulb } from 'lucide-react';
import type { CalloutContent } from '@/gen/mirai/v1/component_content_zod';

// Re-export for compatibility
export type { CalloutContent };

// Callout style string values as defined in proto (CalloutContent.style is string)
// Values: "info", "warning", "success", "error", "tip"
export type CalloutStyleString = 'info' | 'warning' | 'success' | 'error' | 'tip';

interface CalloutRendererProps {
  content: CalloutContent;
  isEditing?: boolean;
  onEdit?: (content: CalloutContent) => void;
}

// Style configuration keyed by string values (matching proto contract)
const styleConfig: Record<
  CalloutStyleString,
  {
    icon: React.ComponentType<{ className?: string }>;
    bgColor: string;
    borderColor: string;
    textColor: string;
    iconColor: string;
    label: string;
  }
> = {
  info: {
    icon: Info,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    textColor: 'text-blue-800',
    iconColor: 'text-blue-600',
    label: 'Info',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-400',
    textColor: 'text-yellow-800',
    iconColor: 'text-yellow-600',
    label: 'Warning',
  },
  success: {
    icon: CheckCircle,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    textColor: 'text-green-800',
    iconColor: 'text-green-600',
    label: 'Success',
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    textColor: 'text-red-800',
    iconColor: 'text-red-600',
    label: 'Error',
  },
  tip: {
    icon: Lightbulb,
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    textColor: 'text-purple-800',
    iconColor: 'text-purple-600',
    label: 'Tip',
  },
};

// Default config for unknown styles
const defaultConfig = styleConfig.info;

export function CalloutRenderer({ content, isEditing = false, onEdit }: CalloutRendererProps) {
  const [editContent, setEditContent] = useState(content);

  // Get config using string style (normalize to lowercase for safety)
  const styleKey = (content.style?.toLowerCase() || 'info') as CalloutStyleString;
  const config = styleConfig[styleKey] || defaultConfig;
  const Icon = config.icon;

  if (isEditing && onEdit) {
    return (
      <div className={`p-4 rounded-lg border-l-4 ${config.bgColor} ${config.borderColor}`}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select
              value={editContent.style}
              onChange={(e) => {
                const updated = { ...editContent, style: e.target.value };
                setEditContent(updated);
                onEdit(updated);
              }}
              className="text-sm bg-transparent border rounded px-2 py-1"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="tip">Tip</option>
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
 * Get label for callout style (accepts string style from proto)
 */
export function getCalloutStyleLabel(style: string): string {
  const styleKey = (style?.toLowerCase() || 'info') as CalloutStyleString;
  return styleConfig[styleKey]?.label || 'Note';
}
