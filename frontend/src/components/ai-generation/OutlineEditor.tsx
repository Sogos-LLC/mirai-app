'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { create } from '@bufbuild/protobuf';
import type { OutlineSection, OutlineLesson } from '@/gen/mirai/v1/ai_generation_pb';
import { OutlineSectionSchema, OutlineLessonSchema } from '@/gen/mirai/v1/ai_generation_pb';

interface OutlineEditorProps {
  sections: OutlineSection[];
  onChange: (sections: OutlineSection[]) => void;
}

interface SortableSectionProps {
  section: OutlineSection;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateSection: (updates: Partial<OutlineSection>) => void;
  onDeleteSection: () => void;
  onAddLesson: () => void;
  onUpdateLesson: (lessonId: string, updates: Partial<OutlineLesson>) => void;
  onDeleteLesson: (lessonId: string) => void;
  onReorderLessons: (oldIndex: number, newIndex: number) => void;
}

interface SortableLessonProps {
  lesson: OutlineLesson;
  sectionIndex: number;
  lessonIndex: number;
  onUpdate: (updates: Partial<OutlineLesson>) => void;
  onDelete: () => void;
}

function SortableLesson({
  lesson,
  sectionIndex,
  lessonIndex,
  onUpdate,
  onDelete,
}: SortableLessonProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 p-3 bg-white border rounded-lg hover:shadow-sm"
    >
      <button
        type="button"
        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center mt-1">
        {sectionIndex + 1}.{lessonIndex + 1}
      </span>
      <div className="flex-1 min-w-0 space-y-2">
        <input
          type="text"
          value={lesson.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="Lesson title"
        />
        <textarea
          value={lesson.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          rows={2}
          placeholder="Lesson description"
        />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Duration (min):</label>
            <input
              type="number"
              value={lesson.estimatedDurationMinutes}
              onChange={(e) => onUpdate({ estimatedDurationMinutes: parseInt(e.target.value) || 0 })}
              className="w-16 px-2 py-1 text-xs border rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              min="1"
            />
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600"
        title="Delete lesson"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function SortableSection({
  section,
  index,
  isExpanded,
  onToggle,
  onUpdateSection,
  onDeleteSection,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson,
  onReorderLessons,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const lessonSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleLessonDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = section.lessons.findIndex((l) => l.id === active.id);
      const newIndex = section.lessons.findIndex((l) => l.id === over.id);
      onReorderLessons(oldIndex, newIndex);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg overflow-hidden"
    >
      {/* Section Header */}
      <div className="flex items-center gap-2 p-4 bg-indigo-50">
        <button
          type="button"
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-medium">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={section.title}
            onChange={(e) => onUpdateSection({ title: e.target.value })}
            className="w-full px-2 py-1 text-sm font-medium border rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Section title"
          />
        </div>
        <span className="text-xs text-gray-500">{section.lessons.length} lessons</span>
        <button
          type="button"
          onClick={onToggle}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
        >
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={onDeleteSection}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600"
          title="Delete section"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Section Description */}
      {isExpanded && (
        <div className="px-4 py-2 bg-indigo-50 border-b">
          <textarea
            value={section.description}
            onChange={(e) => onUpdateSection({ description: e.target.value })}
            className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            rows={2}
            placeholder="Section description"
          />
        </div>
      )}

      {/* Lessons List */}
      {isExpanded && (
        <div className="p-4 space-y-3 bg-gray-50">
          <DndContext
            sensors={lessonSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleLessonDragEnd}
          >
            <SortableContext
              items={section.lessons.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {section.lessons.map((lesson, lessonIndex) => (
                <SortableLesson
                  key={lesson.id}
                  lesson={lesson}
                  sectionIndex={index}
                  lessonIndex={lessonIndex}
                  onUpdate={(updates) => onUpdateLesson(lesson.id, updates)}
                  onDelete={() => onDeleteLesson(lesson.id)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add Lesson Button */}
          <button
            type="button"
            onClick={onAddLesson}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-indigo-600 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50"
          >
            <Plus className="w-4 h-4" />
            Add Lesson
          </button>
        </div>
      )}
    </div>
  );
}

export function OutlineEditor({ sections, onChange }: OutlineEditorProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(sections.map((s) => s.id))
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);
      onChange(arrayMove(sections, oldIndex, newIndex));
    }
  };

  const updateSection = useCallback(
    (sectionId: string, updates: Partial<OutlineSection>) => {
      onChange(
        sections.map((s) =>
          s.id === sectionId ? { ...s, ...updates } : s
        )
      );
    },
    [sections, onChange]
  );

  const deleteSection = useCallback(
    (sectionId: string) => {
      if (sections.length <= 1) {
        return; // Don't allow deleting the last section
      }
      onChange(sections.filter((s) => s.id !== sectionId));
    },
    [sections, onChange]
  );

  const addSection = useCallback(() => {
    const newSection = create(OutlineSectionSchema, {
      id: `section-${Date.now()}`,
      title: 'New Section',
      description: '',
      order: sections.length,
      lessons: [],
    });
    onChange([...sections, newSection]);
    setExpandedSections((prev) => new Set([...prev, newSection.id]));
  }, [sections, onChange]);

  const addLesson = useCallback(
    (sectionId: string) => {
      onChange(
        sections.map((s) => {
          if (s.id !== sectionId) return s;
          const newLesson = create(OutlineLessonSchema, {
            id: `lesson-${Date.now()}`,
            title: 'New Lesson',
            description: '',
            order: s.lessons.length,
            estimatedDurationMinutes: 10,
            learningObjectives: [],
          });
          return { ...s, lessons: [...s.lessons, newLesson] };
        })
      );
    },
    [sections, onChange]
  );

  const updateLesson = useCallback(
    (sectionId: string, lessonId: string, updates: Partial<OutlineLesson>) => {
      onChange(
        sections.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                lessons: s.lessons.map((l) =>
                  l.id === lessonId ? { ...l, ...updates } : l
                ),
              }
            : s
        )
      );
    },
    [sections, onChange]
  );

  const deleteLesson = useCallback(
    (sectionId: string, lessonId: string) => {
      onChange(
        sections.map((s) =>
          s.id === sectionId
            ? { ...s, lessons: s.lessons.filter((l) => l.id !== lessonId) }
            : s
        )
      );
    },
    [sections, onChange]
  );

  const reorderLessons = useCallback(
    (sectionId: string, oldIndex: number, newIndex: number) => {
      onChange(
        sections.map((s) =>
          s.id === sectionId
            ? { ...s, lessons: arrayMove(s.lessons, oldIndex, newIndex) }
            : s
        )
      );
    },
    [sections, onChange]
  );

  const activeSection = activeId
    ? sections.find((s) => s.id === activeId)
    : null;

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {sections.map((section, index) => (
            <SortableSection
              key={section.id}
              section={section}
              index={index}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              onUpdateSection={(updates) => updateSection(section.id, updates)}
              onDeleteSection={() => deleteSection(section.id)}
              onAddLesson={() => addLesson(section.id)}
              onUpdateLesson={(lessonId, updates) =>
                updateLesson(section.id, lessonId, updates)
              }
              onDeleteLesson={(lessonId) => deleteLesson(section.id, lessonId)}
              onReorderLessons={(oldIdx, newIdx) =>
                reorderLessons(section.id, oldIdx, newIdx)
              }
            />
          ))}
        </SortableContext>

        <DragOverlay>
          {activeSection ? (
            <div className="border rounded-lg overflow-hidden shadow-lg bg-white opacity-90">
              <div className="flex items-center gap-2 p-4 bg-indigo-50">
                <GripVertical className="w-5 h-5 text-gray-400" />
                <span className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-medium flex items-center justify-center">
                  {sections.findIndex((s) => s.id === activeSection.id) + 1}
                </span>
                <span className="font-medium">{activeSection.title}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Add Section Button */}
      <button
        type="button"
        onClick={addSection}
        className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-indigo-600 border-2 border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50"
      >
        <Plus className="w-5 h-5" />
        Add Section
      </button>
    </div>
  );
}
