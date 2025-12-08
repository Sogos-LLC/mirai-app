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
  Menu,
  Download,
  Check,
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
import { useGetCourseOutline, useListGeneratedLessons, useUpdateLessonComponents, LessonComponentType } from '@/hooks/useAIGeneration';
import { ComponentRenderer } from '@/components/course/renderers/ComponentRenderer';
import { EditModal } from '@/components/course/modals/EditModal';
import { useCourseEditorStore, setOnSaveCallback } from '@/store/zustand/courseEditorStore';
import type { LessonComponent, GeneratedLesson, OutlineSection } from '@/gen/mirai/v1/ai_generation_pb';
import { useIsMobile } from '@/hooks/useBreakpoint';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  useExportCourse,
  ExportFormat,
} from '@/hooks/useExport';

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
      {/* Drag handle - visible on hover (desktop) or always visible (mobile) */}
      <button
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center lg:opacity-0 lg:group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing -translate-x-full z-10 min-h-[44px] min-w-[44px]"
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
      <div className="absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center -translate-x-full">
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

// Export modal states
type ExportModalState = 'idle' | 'starting' | 'queued';

export default function CourseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;
  const isMobile = useIsMobile();

  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [localComponents, setLocalComponents] = useState<LessonComponent[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [deletingComponentId, setDeletingComponentId] = useState<string | null>(null);

  // Export state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportModalState, setExportModalState] = useState<ExportModalState>('idle');

  // Zustand store for modal editing
  const openEditModal = useCourseEditorStore((s) => s.openEditModal);

  // Fetch outline and lessons
  const { data: outline, isLoading: outlineLoading } = useGetCourseOutline(courseId);
  const { data: generatedLessons, isLoading: lessonsLoading } = useListGeneratedLessons(courseId);

  // Mutation for saving components
  const { mutate: saveComponents, isLoading: isSaving } = useUpdateLessonComponents();

  // Export hooks
  const { mutate: startExport, isLoading: isStarting } = useExportCourse();

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
      openEditModal(courseId, selectedLessonId, component);
    }
  }, [courseId, selectedLessonId, openEditModal]);

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
      openEditModal(courseId, selectedLessonId, newComponent);
    }
  };

  const handleDeleteComponent = (componentId: string) => {
    setLocalComponents((items) => items.filter((item) => item.id !== componentId));
    setHasChanges(true);
    setDeletingComponentId(null);
  };

  const handleConfirmDelete = () => {
    if (deletingComponentId) {
      handleDeleteComponent(deletingComponentId);
    }
  };

  const handleSave = async () => {
    // Need the generated lesson ID, not the outline lesson ID
    const generatedLessonId = currentLesson?.generated?.id;
    if (!generatedLessonId || localComponents.length === 0) return;

    try {
      await saveComponents({
        courseId,
        generatedLessonId,
        components: localComponents.map((c) => ({
          id: c.id,
          type: c.type as LessonComponentType,
          order: c.order,
          contentJson: c.contentJson,
          alignment: c.alignment
            ? { learningObjectiveIds: c.alignment.learningObjectiveIds ?? [] }
            : undefined,
        })),
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save components:', error);
      // Error handling - could show a toast notification here
    }
  };

  // Export handlers
  const handleExport = async () => {
    setExportModalState('starting');
    try {
      await startExport(courseId, ExportFormat.SCORM_2004);
      setExportModalState('queued');
    } catch (err) {
      console.error('Failed to start export:', err);
      // Reset to idle on error so user can try again
      setExportModalState('idle');
    }
  };

  const handleCloseExportModal = useCallback(() => {
    setShowExportModal(false);
    // Reset state after animation
    setTimeout(() => setExportModalState('idle'), 300);
  }, []);

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
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowExportModal(true)}
          >
            <Download className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
          </Button>
        </div>
      </div>

      {/* Mobile navigation button */}
      <button
        onClick={() => setShowMobileNav(true)}
        className="lg:hidden fixed bottom-6 left-6 z-20 p-4 bg-primary-600 text-white rounded-full shadow-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Open course outline"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile navigation sheet */}
      <BottomSheet
        isOpen={showMobileNav}
        onClose={() => setShowMobileNav(false)}
        title="Course Outline"
        height="half"
      >
        <nav className="space-y-2">
          {outline?.sections?.map((section: OutlineSection, sectionIndex: number) => {
            const isExpanded = expandedSections.has(sectionIndex);
            const sectionLessons = lessonsList.filter((l) => l.sectionIndex === sectionIndex);

            return (
              <div key={section.id} className="mb-1">
                <button
                  onClick={() => toggleSection(sectionIndex)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-hover transition-colors rounded-lg min-h-[44px]"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-muted" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted" />
                  )}
                  <span className="text-base font-medium text-primary truncate">
                    {section.title}
                  </span>
                </button>

                {isExpanded && (
                  <div className="ml-4 space-y-1">
                    {sectionLessons.map((lesson) => {
                      const isActive = lesson.id === selectedLessonId;
                      const hasContent = !!lesson.generated;

                      return (
                        <button
                          key={lesson.id}
                          onClick={() => {
                            setSelectedLessonId(lesson.id);
                            setShowMobileNav(false);
                          }}
                          disabled={!hasContent}
                          className={`
                            w-full flex items-center gap-2 px-4 py-3 text-left text-base transition-colors rounded-lg min-h-[44px]
                            ${isActive ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600' : 'hover:bg-hover text-secondary'}
                            ${!hasContent ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                        >
                          <FileText className="w-4 h-4 flex-shrink-0" />
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
      </BottomSheet>

      {/* Editor layout */}
      <div className="flex gap-6">
        {/* Desktop Sidebar - Course outline */}
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
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <CardTitle as="h2">{currentLesson.title}</CardTitle>
                  <div className="relative w-full sm:w-auto">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAddMenu(!showAddMenu)}
                      className="w-full sm:w-auto min-h-[44px]"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Component
                    </Button>
                    {showAddMenu && (
                      <>
                        {/* Mobile: Bottom sheet for add menu */}
                        {isMobile ? (
                          <BottomSheet
                            isOpen={showAddMenu}
                            onClose={() => setShowAddMenu(false)}
                            title="Add Component"
                            height="auto"
                          >
                            <div className="space-y-2">
                              {COMPONENT_TYPES.map(({ type, name, icon: Icon }) => (
                                <button
                                  key={type}
                                  onClick={() => handleAddComponent(type)}
                                  className="w-full flex items-center gap-3 px-4 py-4 text-base text-secondary hover:bg-hover transition-colors rounded-lg min-h-[44px]"
                                >
                                  <Icon className="w-5 h-5" />
                                  {name}
                                </button>
                              ))}
                            </div>
                          </BottomSheet>
                        ) : (
                          /* Desktop: Dropdown menu */
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
                      </>
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
                      <div className="space-y-4 pl-4 md:pl-10">
                        {localComponents.map((component) => (
                          <div key={component.id} className="group/item relative">
                            <SortableComponent
                              component={component}
                              onClick={() => handleComponentClick(component)}
                              isDragging={activeId === component.id}
                            />
                            {/* Delete button - visible on mobile, hover on desktop */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingComponentId(component.id);
                              }}
                              className="absolute -right-2 -top-2 p-2 bg-red-500 text-white rounded-full lg:opacity-0 lg:group-hover/item:opacity-100 transition-opacity hover:bg-red-600 z-20 min-h-[44px] min-w-[44px] flex items-center justify-center"
                              title="Delete component"
                              aria-label="Delete component"
                            >
                              <Trash2 className="w-4 h-4" />
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

      {/* Click outside to close add menu (desktop only) */}
      {showAddMenu && !isMobile && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowAddMenu(false)}
        />
      )}

      {/* Edit Modal */}
      <EditModal />

      {/* Delete Confirmation Modal */}
      <ResponsiveModal
        isOpen={!!deletingComponentId}
        onClose={() => setDeletingComponentId(null)}
        title="Delete Component"
        size="sm"
        mobileHeight="auto"
        footer={
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setDeletingComponentId(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              className="w-full sm:w-auto"
            >
              Delete
            </Button>
          </div>
        }
      >
        <div className="text-center sm:text-left">
          <p className="text-secondary">
            Are you sure you want to delete this component? This action cannot be undone.
          </p>
        </div>
      </ResponsiveModal>

      {/* Export Modal */}
      <ResponsiveModal
        isOpen={showExportModal}
        onClose={handleCloseExportModal}
        title={exportModalState === 'queued' ? "Export Started!" : "Export Course"}
        size="md"
        mobileHeight="auto"
      >
        {/* Idle state - initial format selection */}
        {exportModalState === 'idle' && (
          <>
            <p className="text-secondary mb-6">
              Export your course to SCORM 2004 format for use in your LMS (Docebo compatible).
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCloseExportModal}
                className="flex-1 px-4 py-2 min-h-[44px] border border rounded-lg hover:bg-hover text-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isStarting}
                className="flex-1 px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                Export SCORM
              </button>
            </div>
          </>
        )}

        {/* Starting state - initiating export */}
        {exportModalState === 'starting' && (
          <div className="text-center py-6">
            <Loader2 className="w-12 h-12 text-purple-600 dark:text-purple-400 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-primary mb-2">Starting Export...</h3>
            <p className="text-secondary">Preparing your course for export.</p>
          </div>
        )}

        {/* Queued state - export is running in background */}
        {exportModalState === 'queued' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-primary mb-2">Export Started!</h3>
            <p className="text-secondary mb-4">
              Your course is being exported in the background.
            </p>

            {/* Info box */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>You&apos;ll receive a notification</strong> when your SCORM package is ready to download.
                You can continue working in the meantime.
              </p>
            </div>

            <button
              onClick={handleCloseExportModal}
              className="w-full px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              OK
            </button>
          </div>
        )}
      </ResponsiveModal>
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
