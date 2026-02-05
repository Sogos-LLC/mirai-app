'use client';

import React from 'react';
import {
  ArrowLeft,
  Eye,
  Download,
  Loader2,
  Cloud,
  CloudOff,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import type { SaveStatus } from '@/hooks/useAutoSave';

interface CourseEditorHeaderProps {
  courseId: string;
  saveStatus: SaveStatus;
  onBack: () => void;
  onPreview: () => void;
  onExport: () => void;
}

export function CourseEditorHeader({
  saveStatus,
  onBack,
  onPreview,
  onExport,
}: CourseEditorHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm hidden sm:inline">Back to Library</span>
        </button>
        <div className="h-6 w-px bg-surface border-l" />
        <h1 className="text-lg md:text-xl font-semibold text-primary">Course Editor</h1>
        {/* Auto-save status indicator */}
        {saveStatus === 'saving' && (
          <span className="flex items-center gap-1.5 text-xs text-secondary">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="hidden sm:inline">Saving...</span>
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
            <Cloud className="w-3 h-3" />
            <span className="hidden sm:inline">Saved</span>
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
            <CloudOff className="w-3 h-3" />
            <span className="hidden sm:inline">Save failed</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onPreview}
        >
          <Eye className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Preview</span>
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onExport}
        >
          <Download className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </div>
    </div>
  );
}
