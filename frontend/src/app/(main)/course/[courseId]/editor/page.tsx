'use client';

import React, { useState, useMemo, useCallback } from 'react';
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
  Type,
  Heading,
  X,
  Check,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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
import type { LessonComponent, GeneratedLesson, OutlineSection } from '@/gen/mirai/v1/ai_generation_pb';

interface SortableComponentProps {
  component: LessonComponent;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: (contentJson: string) => void;
}

function SortableComponent({ component, isSelected, onSelect, onEdit }: SortableComponentProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: component.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getComponentIcon = (type: number) => {
    switch (type) {
      case 1: return <FileText className="w-4 h-4" />;
      case 2: return <Heading className="w-4 h-4" />;
      case 3: return <Image className="w-4 h-4" />;
      case 4: return <HelpCircle className="w-4 h-4" />;
      case 5: return <Code className="w-4 h-4" />;
      case 6: return <AlertCircle className="w-4 h-4" />;
      default: return <Type className="w-4 h-4" />;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${isSelected ? 'z-10' : ''}`}
    >
      {/* Drag handle and type indicator */}
      <div className="absolute left-0 top-0 bottom-0 flex items-center -translate-x-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          {...attributes}
          {...listeners}
          className="p-1 text-muted hover:text-secondary cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <span className="text-muted ml-1">{getComponentIcon(component.type)}</span>
      </div>

      {/* Component content */}
      <ComponentRenderer
        component={component}
        isEditing={false}
        isSelected={isSelected}
        onSelect={onSelect}
        onUpdate={onEdit}
      />
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
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [localComponents, setLocalComponents] = useState<LessonComponent[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Fetch outline and lessons
  const { data: outline, isLoading: outlineLoading } = useGetCourseOutline(courseId);
  const { data: generatedLessons, isLoading: lessonsLoading } = useListGeneratedLessons(courseId);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  // Get current lesson's components
  const currentLesson = useMemo(() => {
    return lessonsList.find((l) => l.id === selectedLessonId);
  }, [lessonsList, selectedLessonId]);

  // Initialize local components when lesson changes
  React.useEffect(() => {
    if (currentLesson?.generated?.components) {
      const sorted = [...currentLesson.generated.components].sort((a, b) => a.order - b.order);
      setLocalComponents(sorted);
      setHasChanges(false);
    } else {
      setLocalComponents([]);
    }
    setSelectedComponentId(null);
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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalComponents((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const reordered = arrayMove(items, oldIndex, newIndex);
        // Update order values
        return reordered.map((item, index) => ({
          ...item,
          order: index,
        }));
      });
      setHasChanges(true);
    }
  }, []);

  const handleComponentEdit = useCallback((componentId: string, contentJson: string) => {
    setLocalComponents((items) =>
      items.map((item) =>
        item.id === componentId ? { ...item, contentJson } : item
      )
    );
    setHasChanges(true);
  }, []);

  const handleAddComponent = (type: number) => {
    const newComponent: LessonComponent = {
      id: `temp-${Date.now()}`,
      type,
      contentJson: getDefaultContentForType(type),
      order: localComponents.length,
      $typeName: 'mirai.v1.LessonComponent',
    };
    setLocalComponents([...localComponents, newComponent]);
    setSelectedComponentId(newComponent.id);
    setShowAddMenu(false);
    setHasChanges(true);
  };

  const handleDeleteComponent = () => {
    if (!selectedComponentId) return;
    setLocalComponents((items) => items.filter((item) => item.id !== selectedComponentId));
    setSelectedComponentId(null);
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
                  <div className="flex items-center gap-2">
                    {selectedComponentId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDeleteComponent}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    )}
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
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white border rounded-lg shadow-lg z-20">
                          {COMPONENT_TYPES.map(({ type, name, icon: Icon }) => (
                            <button
                              key={type}
                              onClick={() => handleAddComponent(type)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-secondary hover:bg-surface transition-colors first:rounded-t-lg last:rounded-b-lg"
                            >
                              <Icon className="w-4 h-4" />
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-6">
                {localComponents.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={localComponents.map((c) => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4 pl-10">
                        {localComponents.map((component) => (
                          <SortableComponent
                            key={component.id}
                            component={component}
                            isSelected={component.id === selectedComponentId}
                            onSelect={() => setSelectedComponentId(
                              component.id === selectedComponentId ? null : component.id
                            )}
                            onEdit={(contentJson) => handleComponentEdit(component.id, contentJson)}
                          />
                        ))}
                      </div>
                    </SortableContext>
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
