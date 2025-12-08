'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Eye,
  Save,
  Plus,
  GripVertical,
  Loader2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  FileText,
  Image,
  HelpCircle,
  Code,
  AlertCircle,
  Heading,
  Trash2,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Button from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useGetCourseOutline, useListGeneratedLessons } from '@/hooks/useAIGeneration';
import { ComponentRenderer } from '@/components/course/renderers/ComponentRenderer';
import { EditModal } from '@/components/course/modals/EditModal';
import { useCourseEditorStore, setOnSaveCallback } from '@/store/zustand/courseEditorStore';
import type { LessonComponent, GeneratedLesson, OutlineSection } from '@/gen/mirai/v1/ai_generation_pb';

interface SortableComponentProps {
  component: LessonComponent;
  onClick: () => void;
  isDragging: boolean;
}

function SortableComponent({ component, onClick, isDragging }: SortableComponentProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative cursor-pointer ${isDragging ? 'opacity-0' : ''}`}
      onClick={onClick}
    >
      {/* Drag handle - only visible on hover */}
      <button
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing -translate-x-10 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-5 h-5 text-muted" />
      </button>

      {/* Component content */}
      <div className="hover:ring-2 hover:ring-purple-300 hover:ring-offset-2 rounded-lg transition-all">
        <ComponentRenderer component={component} isEditing={false} />
      </div>
    </div>
  );
}

// Preview component for drag overlay - renders outside DOM flow for smooth dragging
function DragPreview({ component }: { component: LessonComponent }) {
  return (
    <div className="relative bg-surface rounded-lg border-2 border-purple-400 shadow-2xl cursor-grabbing">
      {/* Drag handle visible during drag */}
      <div className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center -translate-x-10">
        <GripVertical className="w-5 h-5 text-purple-400" />
      </div>
      <div className="p-4">
        <ComponentRenderer component={component} isEditing={false} />
      </div>
    </div>
  );
}

const COMPONENT_TYPES = [
  { type: 1, name: 'Text', icon: FileText },
  { type: 2, name: 'Heading', icon: Heading },
  { type: 3, name: 'Image', icon: Image },
  { type: 4, name: 'Quiz', icon: HelpCircle },
  { type: 5, name: 'Code', icon: Code },
  { type: 6, name: 'Callout', icon: AlertCircle },
];

export default function CourseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;

  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [localComponents, setLocalComponents] = useState<LessonComponent[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Zustand store for modal editing
  const openEditModal = useCourseEditorStore((s) => s.openEditModal);

  // Fetch outline and lessons
  const { data: outline, isLoading: outlineLoading } = useGetCourseOutline(courseId);
  const { data: generatedLessons, isLoading: lessonsLoading } = useListGeneratedLessons(courseId);

  // DnD sensors with 8px activation distance to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Set up save callback for zustand store
  useEffect(() => {
    setOnSaveCallback((componentId: string, contentJson: string) => {
      setLocalComponents((items) =>
        items.map((item) =>
          item.id === componentId ? { ...item, contentJson } : item
        )
      );
      setHasChanges(true);
    });
  }, []);

  // Build lesson list from outline
  const lessonsList = useMemo(() => {
    if (!outline?.sections) return [];
    const items: { id: string; title: string; sectionIndex: number; generated?: GeneratedLesson }[] = [];
    outline.sections.forEach((section, sectionIndex) => {
      section.lessons?.forEach((lesson) => {
        const generated = generatedLessons?.find((gl) => gl.outlineLessonId === lesson.id);
        items.push({
          id: lesson.id,
          title: lesson.title,
          sectionIndex,
          generated,
        });
      });
    });
    return items;
  }, [outline, generatedLessons]);

  // Get current lesson
  const currentLesson = useMemo(() => {
    return lessonsList.find((l) => l.id === selectedLessonId);
  }, [lessonsList, selectedLessonId]);

  // Get active component for drag overlay
  const activeComponent = useMemo(() => {
    return localComponents.find((c) => c.id === activeId);
  }, [localComponents, activeId]);

  // Initialize local components when lesson changes
  useEffect(() => {
    if (currentLesson?.generated?.components) {
      const sorted = [...currentLesson.generated.components].sort((a, b) => a.order - b.order);
      setLocalComponents(sorted);
      setHasChanges(false);
    } else {
      setLocalComponents([]);
    }
  }, [currentLesson?.generated?.components, selectedLessonId]);

  const toggleSection = (sectionIndex: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionIndex)) {
        next.delete(sectionIndex);
      } else {
        next.add(sectionIndex);
      }
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setLocalComponents((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const reordered = arrayMove(items, oldIndex, newIndex);
        return reordered.map((item, index) => ({
          ...item,
          order: index,
        }));
      });
      setHasChanges(true);
    }
  }, []);

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const handleComponentClick = useCallback((component: LessonComponent) => {
    if (selectedLessonId) {
      openEditModal(selectedLessonId, component);
    }
  }, [selectedLessonId, openEditModal]);

  const handleAddComponent = (type: number) => {
    const newComponent: LessonComponent = {
      id: `temp-${Date.now()}`,
      type,
      contentJson: getDefaultContentForType(type),
      order: localComponents.length,
      $typeName: 'mirai.v1.LessonComponent',
    };
    setLocalComponents([...localComponents, newComponent]);
    setShowAddMenu(false);
    setHasChanges(true);

    // Open edit modal for the new component
    if (selectedLessonId) {
      openEditModal(selectedLessonId, newComponent);
    }
  };

  const handleDeleteComponent = (componentId: string) => {
    setLocalComponents((items) => items.filter((item) => item.id !== componentId));
    setHasChanges(true);
  };

  const handleSave = async () => {
    // TODO: Implement save via API
    console.log('Saving components:', localComponents);
    setHasChanges(false);
  };

  // Loading state
  if (outlineLoading || lessonsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary">Loading course...</p>
        </div>
      </div>
    );
  }

  // No outline
  if (!outline) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-muted mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-primary mb-2">Course Not Found</h2>
          <p className="text-secondary mb-4">This course outline could not be loaded.</p>
          <Button variant="primary" onClick={() => router.push('/content-library')}>
            Back to Library
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/content-library')}
            className="flex items-center gap-2 text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">Back to Library</span>
          </button>
          <div className="h-6 w-px bg-surface border-l" />
          <h1 className="text-lg md:text-xl font-semibold text-primary">Course Editor</h1>
          {hasChanges && (
            <span className="text-xs text-warning bg-yellow-100 px-2 py-1 rounded">Unsaved</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/course/${courseId}/preview`)}
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      {/* Editor layout */}
      <div className="flex gap-6">
        {/* Sidebar - Course outline */}
        <aside className="w-64 flex-shrink-0 hidden lg:block">
          <Card>
            <CardHeader className="py-3">
              <CardTitle as="h3">Course Outline</CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-0">
              <nav className="max-h-[calc(100vh-20rem)] overflow-y-auto">
                {outline.sections?.map((section: OutlineSection, sectionIndex: number) => {
                  const isExpanded = expandedSections.has(sectionIndex);
                  const sectionLessons = lessonsList.filter((l) => l.sectionIndex === sectionIndex);

                  return (
                    <div key={section.id} className="mb-1">
                      <button
                        onClick={() => toggleSection(sectionIndex)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-surface transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted" />
                        )}
                        <span className="text-sm font-medium text-primary truncate">
                          {section.title}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="ml-4">
                          {sectionLessons.map((lesson) => {
                            const isActive = lesson.id === selectedLessonId;
                            const hasContent = !!lesson.generated;

                            return (
                              <button
                                key={lesson.id}
                                onClick={() => setSelectedLessonId(lesson.id)}
                                disabled={!hasContent}
                                className={`
                                  w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors
                                  ${isActive ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600' : 'hover:bg-surface text-secondary'}
                                  ${!hasContent ? 'opacity-50 cursor-not-allowed' : ''}
                                `}
                              >
                                <FileText className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{lesson.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </CardContent>
          </Card>
        </aside>

        {/* Main content - Lesson editor */}
        <main className="flex-1 min-w-0">
          {selectedLessonId && currentLesson ? (
            <Card>
              <CardHeader className="py-4 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle as="h2">{currentLesson.title}</CardTitle>
                  <div className="relative">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAddMenu(!showAddMenu)}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Component
                    </Button>
                    {showAddMenu && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-default rounded-lg shadow-lg z-20">
                        {COMPONENT_TYPES.map(({ type, name, icon: Icon }) => (
                          <button
                            key={type}
                            onClick={() => handleAddComponent(type)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-secondary hover:bg-hover transition-colors first:rounded-t-lg last:rounded-b-lg"
                          >
                            <Icon className="w-4 h-4" />
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-6">
                {localComponents.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                  >
                    <SortableContext
                      items={localComponents.map((c) => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4 pl-10">
                        {localComponents.map((component) => (
                          <div key={component.id} className="group/item relative">
                            <SortableComponent
                              component={component}
                              onClick={() => handleComponentClick(component)}
                              isDragging={activeId === component.id}
                            />
                            {/* Delete button on hover */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteComponent(component.id);
                              }}
                              className="absolute -right-2 -top-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover/item:opacity-100 transition-opacity hover:bg-red-600 z-20"
                              title="Delete component"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </SortableContext>

                    {/* Drag overlay - renders outside DOM flow for smooth dragging */}
                    <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
                      {activeComponent ? (
                        <DragPreview component={activeComponent} />
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                ) : (
                  <div className="text-center py-12">
                    <Plus className="w-12 h-12 text-muted mx-auto mb-4" />
                    <p className="text-secondary mb-4">No components yet. Add one to get started.</p>
                    <Button
                      variant="secondary"
                      onClick={() => setShowAddMenu(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Component
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <BookOpen className="w-16 h-16 text-muted mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-primary mb-2">Select a Lesson</h2>
                  <p className="text-secondary max-w-md mx-auto">
                    Choose a lesson from the outline on the left to start editing its components.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      {/* Click outside to close add menu */}
      {showAddMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowAddMenu(false)}
        />
      )}

      {/* Edit Modal */}
      <EditModal />
    </div>
  );
}

function getDefaultContentForType(type: number): string {
  switch (type) {
    case 1: // Text
      return JSON.stringify({ html: '<p>New text content</p>', plaintext: 'New text content' });
    case 2: // Heading
      return JSON.stringify({ level: 2, text: 'New Heading' });
    case 3: // Image
      return JSON.stringify({ imageDescription: 'Image description', altText: 'Image alt text' });
    case 4: // Quiz
      return JSON.stringify({
        question: 'Your question here?',
        questionType: 'multiple_choice',
        options: [
          { id: 'a', text: 'Option A' },
          { id: 'b', text: 'Option B' },
          { id: 'c', text: 'Option C' },
        ],
        correctAnswerId: 'a',
        explanation: 'Explanation here',
      });
    case 5: // Code
      return JSON.stringify({ code: '// Your code here', language: 'javascript' });
    case 6: // Callout
      return JSON.stringify({ style: 1, title: 'Note', content: 'Your callout content here' });
    default:
      return '{}';
  }
}
