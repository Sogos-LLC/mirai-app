'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  GripVertical,
  ChevronDown,
  ChevronUp,
  Trash2,
  MoreVertical,
  Pencil,
  Target,
  Plus,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ComponentRenderer } from '@/components/course/renderers/ComponentRenderer';
import { LessonComponentType } from '@/hooks/useAIGeneration';
import type { LessonComponent } from '@/gen/mirai/v1/ai_generation_types_pb';

interface SortableComponentProps {
  component: LessonComponent;
  index: number;
  totalCount: number;
  onClick: () => void;
  isDragging: boolean;
  onOpenRealignment?: (component: LessonComponent) => void;
  onDelete: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

export function SortableComponent({
  component,
  index,
  totalCount,
  onClick,
  isDragging,
  onOpenRealignment,
  onDelete,
  onMoveUp,
  onMoveDown,
}: SortableComponentProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: component.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Check if this component type supports realignment
  const supportsRealignment = [
    LessonComponentType.TEXT,
    LessonComponentType.STATEMENT,
    LessonComponentType.QUOTE,
    LessonComponentType.LIST,
    LessonComponentType.CALLOUT,
  ].includes(component.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${isDragging ? 'opacity-0' : ''}`}
    >
      {/* Main content area with actions */}
      <div className="flex items-stretch">
        {/* Drag handle - left gutter */}
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 w-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-muted" />
        </button>

        {/* Component content - clickable to edit */}
        <div
          className="flex-1 min-w-0 cursor-pointer rounded-lg transition-all group-hover:bg-purple-50/50 dark:group-hover:bg-purple-900/10"
          onClick={onClick}
        >
          <ComponentRenderer
            component={component}
            isEditing={false}
          />
        </div>

        {/* Actions menu - right edge */}
        <div className="flex-shrink-0 w-10 flex items-start justify-center pt-2 relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
            aria-label="Component actions"
          >
            <MoreVertical className="w-4 h-4 text-muted" />
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div className="absolute right-0 top-10 z-50 w-48 bg-white dark:bg-dark-surface-elevated rounded-lg shadow-lg border border-default py-1 animate-fadeIn">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onClick();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Pencil className="w-4 h-4 text-muted" />
                <span className="text-primary">Edit</span>
              </button>

              {supportsRealignment && onOpenRealignment && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onOpenRealignment(component);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Target className="w-4 h-4 text-muted" />
                  <span className="text-primary">Realign to objectives</span>
                </button>
              )}

              <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onMoveUp(index);
                }}
                disabled={index === 0}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronUp className="w-4 h-4 text-muted" />
                <span className="text-primary">Move up</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onMoveDown(index);
                }}
                disabled={index === totalCount - 1}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronDown className="w-4 h-4 text-muted" />
                <span className="text-primary">Move down</span>
              </button>

              <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(component.id);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface AddBetweenProps {
  onAdd: () => void;
}

export function AddBetween({ onAdd }: AddBetweenProps) {
  return (
    <div className="group/add relative h-4 -my-1">
      {/* Hover area - larger than visual */}
      <div className="absolute inset-x-0 -inset-y-2 flex items-center justify-center">
        {/* Line that appears on hover */}
        <div className="absolute inset-x-8 h-px bg-purple-300 dark:bg-purple-700 opacity-0 group-hover/add:opacity-100 transition-opacity" />

        {/* Add button */}
        <button
          onClick={onAdd}
          className="relative z-10 flex items-center gap-2 px-3 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 bg-white dark:bg-dark-surface rounded-full border border-purple-200 dark:border-purple-800 opacity-0 group-hover/add:opacity-100 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-all shadow-sm"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
    </div>
  );
}

export function DragPreview({ component }: { component: LessonComponent }) {
  return (
    <div className="relative bg-surface rounded-lg border-2 border-purple-400 shadow-2xl cursor-grabbing">
      <div className="absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center -translate-x-full">
        <GripVertical className="w-5 h-5 text-purple-400" />
      </div>
      <div className="p-4">
        <ComponentRenderer component={component} isEditing={false} />
      </div>
    </div>
  );
}
