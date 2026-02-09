'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FileText, MoreVertical, Edit2, FolderInput, Trash2, Info, Share2 } from 'lucide-react';
import { type LibraryEntry } from '@/hooks/useCourses';

export interface CourseCardProps {
  course: LibraryEntry;
  onEdit: (courseId: string) => void;
  onPreview: (courseId: string) => void;
  onDetails?: (courseId: string) => void;
  onShare?: (courseId: string) => void;
  onMoveToFolder?: (courseId: string) => void;
  onDelete?: (courseId: string) => void;
}

export function CourseCard({ course, onEdit, onPreview, onDetails, onShare, onMoveToFolder, onDelete }: CourseCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div
      className="border bg-surface-elevated rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer relative"
      onClick={() => onEdit(course.id)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-medium text-primary line-clamp-2">
            {course.title || 'Untitled Course'}
          </h3>
        </div>

        {/* 3-dot menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors"
            title="Actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-surface-elevated border rounded-lg shadow-lg z-20 py-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onEdit(course.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-hover transition-colors min-h-[40px]"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
              {onDetails && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDetails(course.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-hover transition-colors min-h-[40px]"
                >
                  <Info className="w-4 h-4" />
                  Details
                </button>
              )}
              {onShare && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onShare(course.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-hover transition-colors min-h-[40px]"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
              )}
              {onMoveToFolder && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onMoveToFolder(course.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-hover transition-colors min-h-[40px]"
                >
                  <FolderInput className="w-4 h-4" />
                  Move to Folder
                </button>
              )}
              {onDelete && (
                <>
                  <div className="border-t my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete(course.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors min-h-[40px]"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {course.tags && course.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {course.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded"
            >
              {tag}
            </span>
          ))}
          {course.tags.length > 3 && (
            <span className="text-xs text-muted">
              +{course.tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="text-xs text-muted">
        Modified {course.modifiedAt?.seconds
          ? new Date(Number(course.modifiedAt.seconds) * 1000).toLocaleDateString()
          : 'N/A'}
      </div>
    </div>
  );
}
