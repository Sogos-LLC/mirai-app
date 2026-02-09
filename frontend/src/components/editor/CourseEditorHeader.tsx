'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Eye,
  Download,
  Share2,
  Loader2,
  Cloud,
  CloudOff,
  Pencil,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import type { SaveStatus } from '@/hooks/useAutoSave';

interface CourseEditorHeaderProps {
  courseId: string;
  courseTitle: string;
  courseDescription: string;
  saveStatus: SaveStatus;
  onBack: () => void;
  onPreview: () => void;
  onExport: () => void;
  onShare?: () => void;
  onUpdateCourse: (title: string, description: string) => Promise<void>;
}

export function CourseEditorHeader({
  courseTitle,
  courseDescription,
  saveStatus,
  onBack,
  onPreview,
  onExport,
  onShare,
  onUpdateCourse,
}: CourseEditorHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleValue, setTitleValue] = useState(courseTitle);
  const [descriptionValue, setDescriptionValue] = useState(courseDescription);
  const [isSaving, setIsSaving] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);

  // Sync external values when they change (e.g. after refetch)
  useEffect(() => {
    if (!editingTitle) setTitleValue(courseTitle);
  }, [courseTitle, editingTitle]);

  useEffect(() => {
    if (!editingDescription) setDescriptionValue(courseDescription);
  }, [courseDescription, editingDescription]);

  // Focus inputs when editing starts
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    if (editingDescription && descriptionInputRef.current) {
      descriptionInputRef.current.focus();
      descriptionInputRef.current.select();
    }
  }, [editingDescription]);

  const saveTitle = useCallback(async () => {
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === courseTitle) {
      setTitleValue(courseTitle);
      setEditingTitle(false);
      return;
    }
    setIsSaving(true);
    try {
      await onUpdateCourse(trimmed, courseDescription);
      setEditingTitle(false);
    } catch {
      setTitleValue(courseTitle);
      setEditingTitle(false);
    } finally {
      setIsSaving(false);
    }
  }, [titleValue, courseTitle, courseDescription, onUpdateCourse]);

  const saveDescription = useCallback(async () => {
    const trimmed = descriptionValue.trim();
    if (trimmed === courseDescription) {
      setDescriptionValue(courseDescription);
      setEditingDescription(false);
      return;
    }
    setIsSaving(true);
    try {
      await onUpdateCourse(courseTitle, trimmed);
      setEditingDescription(false);
    } catch {
      setDescriptionValue(courseDescription);
      setEditingDescription(false);
    } finally {
      setIsSaving(false);
    }
  }, [descriptionValue, courseTitle, courseDescription, onUpdateCourse]);

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void saveTitle();
    } else if (e.key === 'Escape') {
      setTitleValue(courseTitle);
      setEditingTitle(false);
    }
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void saveDescription();
    } else if (e.key === 'Escape') {
      setDescriptionValue(courseDescription);
      setEditingDescription(false);
    }
  };

  return (
    <div className="mb-6">
      {/* Top row: back button, save status, actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">Back to Library</span>
          </button>
          <div className="h-6 w-px bg-surface border-l" />
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
          {onShare && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onShare}
            >
              <Share2 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          )}
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

      {/* Course title - inline editable */}
      <div className="mt-3">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={handleTitleKeyDown}
            disabled={isSaving}
            className="w-full text-lg md:text-xl font-semibold text-primary bg-transparent border-b-2 border-primary-500 outline-none py-0.5"
            placeholder="Course title"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="group flex items-center gap-2 text-left w-full"
          >
            <h1 className="text-lg md:text-xl font-semibold text-primary truncate">
              {courseTitle || 'Untitled Course'}
            </h1>
            <Pencil className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>
        )}

        {/* Course description - inline editable */}
        {editingDescription ? (
          <textarea
            ref={descriptionInputRef}
            value={descriptionValue}
            onChange={(e) => setDescriptionValue(e.target.value)}
            onBlur={() => void saveDescription()}
            onKeyDown={handleDescriptionKeyDown}
            disabled={isSaving}
            rows={2}
            className="w-full mt-1 text-sm text-secondary bg-transparent border-b-2 border-primary-500 outline-none resize-none py-0.5"
            placeholder="Course description (optional)"
          />
        ) : (
          <button
            onClick={() => setEditingDescription(true)}
            className="group flex items-center gap-2 text-left w-full mt-0.5"
          >
            <p className="text-sm text-muted truncate">
              {courseDescription || 'Add a description...'}
            </p>
            <Pencil className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
}
