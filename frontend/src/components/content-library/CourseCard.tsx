'use client';

import React from 'react';
import { FileText, Edit2, Eye } from 'lucide-react';
import { type LibraryEntry } from '@/hooks/useCourses';

export interface CourseCardProps {
  course: LibraryEntry;
  onEdit: (courseId: string) => void;
  onPreview: (courseId: string) => void;
}

export function CourseCard({ course, onEdit, onPreview }: CourseCardProps) {
  return (
    <div
      className="border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface-elevated rounded-lg p-4 hover:shadow-lg dark:hover:shadow-glow-sm transition-shadow cursor-pointer"
      onClick={() => onEdit(course.id)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white line-clamp-2">
            {course.title || 'Untitled Course'}
          </h3>
        </div>
        <FileText className="w-5 h-5 text-gray-400 dark:text-gray-500" />
      </div>

      {course.tags && course.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {course.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded"
            >
              {tag}
            </span>
          ))}
          {course.tags.length > 3 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              +{course.tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500 dark:text-gray-400">
        Modified {course.modifiedAt?.seconds
          ? new Date(Number(course.modifiedAt.seconds) * 1000).toLocaleDateString()
          : 'N/A'}
      </div>

      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-dark-border">
        <button
          className="flex-1 flex items-center justify-center gap-1 py-2.5 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors min-h-[44px]"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(course.id);
          }}
        >
          <Edit2 className="w-4 h-4" />
          Edit
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-50 rounded-lg transition-colors min-h-[44px]"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(course.id);
          }}
        >
          <Eye className="w-4 h-4" />
          Preview
        </button>
      </div>
    </div>
  );
}
