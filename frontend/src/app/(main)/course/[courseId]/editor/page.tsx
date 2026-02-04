'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Eye,
  Plus,
  Loader2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  FileText,
  Menu,
  Download,
  Cloud,
  CloudOff,
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import Button from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useGetCourseOutline, useListGeneratedLessons, useUpdateLessonComponents, useRegenerateComponent, LessonComponentType } from '@/hooks/useAIGeneration';
import { EditModal } from '@/components/course/modals/EditModal';
import { AddComponentModal } from '@/components/course/modals/AddComponentModal';
import { RealignmentModal, type RealignParams, type RealignResult, type LearningObjective } from '@/components/course/modals/RealignmentModal';
import { useCourseEditorStore, setOnSaveCallback, setOnPersistCallback, setOnPersistSuccessCallback } from '@/store/zustand/courseEditorStore';
import type { LessonComponent, GeneratedLesson, OutlineSection } from '@/gen/mirai/v1/ai_generation_types_pb';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { SortableComponent, AddBetween, DragPreview } from '@/components/editor/SortableComponent';
import { ExportModal } from '@/components/editor/ExportModal';
import { useExportWorkflow } from '@/hooks/useExportWorkflow';
import { useAutoSave } from '@/hooks/useAutoSave';

export default function CourseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = params.courseId as string;
  const lessonIdFromUrl = searchParams.get('lessonId');

  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(lessonIdFromUrl);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [localComponents, setLocalComponents] = useState<LessonComponent[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [addComponentAfterIndex, setAddComponentAfterIndex] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [deletingComponentId, setDeletingComponentId] = useState<string | null>(null);

  // Realignment state
  const [realignmentComponent, setRealignmentComponent] = useState<LessonComponent | null>(null);
  const [isRealigning, setIsRealigning] = useState(false);

  // Zustand store for modal editing
  const openEditModal = useCourseEditorStore((s) => s.openEditModal);

  // Fetch outline and lessons
  const { data: outline, wizardData, isLoading: outlineLoading } = useGetCourseOutline(courseId);
  const { data: generatedLessons, isLoading: lessonsLoading } = useListGeneratedLessons(courseId);

  // Mutation for saving components
  const { mutate: saveComponents, isLoading: isSaving } = useUpdateLessonComponents();

  // Export workflow
  const {
    showExportModal,
    exportModalState,
    exportError,
    exportProgress,
    isStarting,
    isGettingDownload,
    openExportModal,
    closeExportModal,
    startExport,
    downloadExport,
  } = useExportWorkflow(courseId);

  // Realignment hook
  const { mutate: regenerateComponent, isLoading: isRegenerating } = useRegenerateComponent();

  // DnD sensors with 8px activation distance to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Ref to access latest localComponents in callbacks
  const localComponentsRef = useRef<LessonComponent[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    localComponentsRef.current = localComponents;
  }, [localComponents]);

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

  // Auto-select first lesson with generated content when none selected
  useEffect(() => {
    if (!selectedLessonId && lessonsList.length > 0) {
      const firstWithContent = lessonsList.find((l) => !!l.generated);
      if (firstWithContent) {
        setSelectedLessonId(firstWithContent.id);
        setExpandedSections((prev) => new Set(prev).add(firstWithContent.sectionIndex));
      }
    }
  }, [selectedLessonId, lessonsList]);

  // Get current lesson
  const currentLesson = useMemo(() => {
    return lessonsList.find((l) => l.id === selectedLessonId);
  }, [lessonsList, selectedLessonId]);

  // Get learning objectives for current lesson from outline
  const currentLessonLOs = useMemo((): LearningObjective[] => {
    if (!outline?.sections || !selectedLessonId) return [];
    for (const section of outline.sections) {
      const lesson = section.lessons?.find((l) => l.id === selectedLessonId);
      if (lesson?.learningObjectives) {
        return lesson.learningObjectives.map((text, index) => ({
          id: `lo-${index}`,
          text,
        }));
      }
    }
    return [];
  }, [outline, selectedLessonId]);

  // Ref to access latest currentLesson in callbacks
  const currentLessonRef = useRef(currentLesson);

  // Keep ref in sync with state
  useEffect(() => {
    currentLessonRef.current = currentLesson;
  }, [currentLesson]);

  // Set up save callback for zustand store (updates local state)
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

  // Set up persist callback for zustand store (saves to database)
  useEffect(() => {
    setOnPersistCallback(async (componentId: string, contentJson: string) => {
      const components = localComponentsRef.current;
      const lesson = currentLessonRef.current;
      const generatedLessonId = lesson?.generated?.id;

      if (!generatedLessonId || components.length === 0) {
        throw new Error('Cannot persist: no lesson selected or no components');
      }

      const updatedComponents = components.map((c) =>
        c.id === componentId ? { ...c, contentJson } : c
      );

      await saveComponents({
        courseId,
        generatedLessonId,
        components: updatedComponents.map((c) => ({
          id: c.id,
          type: c.type as LessonComponentType,
          order: c.order,
          contentJson: c.contentJson,
          alignment: c.alignment
            ? { learningObjectiveIds: c.alignment.learningObjectiveIds ?? [] }
            : undefined,
        })),
      });
    });
  }, [courseId, saveComponents]);

  // Set up success callback to reset hasChanges after successful persist
  useEffect(() => {
    setOnPersistSuccessCallback(() => {
      setHasChanges(false);
    });
  }, []);

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

  // Auto-save: build the save function
  const autoSaveFn = useCallback(async () => {
    const generatedLessonId = currentLessonRef.current?.generated?.id;
    if (!generatedLessonId || localComponentsRef.current.length === 0) return;

    await saveComponents({
      courseId,
      generatedLessonId,
      components: localComponentsRef.current.map((c) => ({
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
  }, [courseId, saveComponents]);

  const { saveStatus } = useAutoSave(hasChanges, isSaving, autoSaveFn);

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

  // Called by AddComponentModal after user finishes editing the new component
  const handleAddComponent = useCallback((component: LessonComponent, contentJson: string) => {
    const finalComponent = { ...component, contentJson };
    const insertIndex = addComponentAfterIndex ?? localComponents.length - 1;
    const newComponents = [...localComponents];
    newComponents.splice(insertIndex + 1, 0, finalComponent);
    const reorderedComponents = newComponents.map((c, idx) => ({ ...c, order: idx }));

    setLocalComponents(reorderedComponents);
    localComponentsRef.current = reorderedComponents;
    setHasChanges(true);
  }, [addComponentAfterIndex, localComponents]);

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

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setLocalComponents((items) => {
      const newItems = arrayMove(items, index, index - 1);
      return newItems.map((item, idx) => ({ ...item, order: idx }));
    });
    setHasChanges(true);
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setLocalComponents((items) => {
      if (index >= items.length - 1) return items;
      const newItems = arrayMove(items, index, index + 1);
      return newItems.map((item, idx) => ({ ...item, order: idx }));
    });
    setHasChanges(true);
  }, []);

  // Export retry handler
  const handleExportRetry = useCallback(() => {
    closeExportModal();
    setTimeout(() => {
      openExportModal();
      startExport();
    }, 350);
  }, [closeExportModal, openExportModal, startExport]);

  // Realignment handlers
  const handleOpenRealignment = useCallback((component: LessonComponent) => {
    setRealignmentComponent(component);
  }, []);

  const handleCloseRealignment = useCallback(() => {
    setRealignmentComponent(null);
  }, []);

  const handleRealign = useCallback(async (params: RealignParams): Promise<RealignResult | void> => {
    const generatedLessonId = currentLesson?.generated?.id;
    if (!generatedLessonId) return;

    setIsRealigning(true);
    try {
      const result = await regenerateComponent({
        courseId,
        generatedLessonId,
        componentId: params.componentId,
        modificationPrompt: params.customPrompt || '',
        alignmentTargets: {
          personaIds: params.personaIds,
          learningObjectiveIds: params.learningObjectiveIds,
        },
      });
      return { job: result.job };
    } catch (error) {
      console.error('Failed to realign component:', error);
      throw error;
    } finally {
      setIsRealigning(false);
    }
  }, [courseId, currentLesson?.generated?.id, regenerateComponent]);

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
            onClick={() => router.push(`/preview/${courseId}`)}
          >
            <Eye className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={openExportModal}
          >
            <Download className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Mobile navigation button - positioned above bottom nav */}
      <button
        onClick={() => setShowMobileNav(true)}
        className="lg:hidden fixed z-40 p-4 bg-primary-600 text-white rounded-full shadow-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
        style={{ bottom: 'calc(var(--bottom-nav-height) + var(--safe-area-bottom) + 1rem)', left: '1rem' }}
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
                <CardTitle as="h2">{currentLesson.title}</CardTitle>
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
                        {/* Add at top */}
                        <AddBetween onAdd={() => setAddComponentAfterIndex(-1)} />

                        {localComponents.map((component, index) => (
                          <React.Fragment key={component.id}>
                            <SortableComponent
                              component={component}
                              index={index}
                              totalCount={localComponents.length}
                              onClick={() => handleComponentClick(component)}
                              isDragging={activeId === component.id}
                              onOpenRealignment={handleOpenRealignment}
                              onDelete={(id) => setDeletingComponentId(id)}
                              onMoveUp={handleMoveUp}
                              onMoveDown={handleMoveDown}
                            />
                            {/* Add between components */}
                            <AddBetween onAdd={() => setAddComponentAfterIndex(index)} />
                          </React.Fragment>
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
                      onClick={() => setAddComponentAfterIndex(-1)}
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
                  <p className="text-secondary max-w-md mx-auto hidden lg:block">
                    Choose a lesson from the outline on the left to start editing its components.
                  </p>
                  <p className="text-secondary max-w-md mx-auto lg:hidden mb-6">
                    Tap the menu button below to open the course outline and select a lesson.
                  </p>
                  {/* Mobile: Show a prominent button to open the outline */}
                  <button
                    onClick={() => setShowMobileNav(true)}
                    className="lg:hidden inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors min-h-[44px]"
                  >
                    <Menu className="w-5 h-5" />
                    Open Course Outline
                  </button>
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      {/* Add Component Modal - unified selection and editing */}
      <AddComponentModal
        isOpen={addComponentAfterIndex !== null}
        onClose={() => setAddComponentAfterIndex(null)}
        onAdd={handleAddComponent}
        insertAfterIndex={addComponentAfterIndex ?? 0}
        courseId={courseId}
        lessonId={selectedLessonId ?? ''}
      />

      {/* Edit Modal - for editing existing components */}
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
      <ExportModal
        isOpen={showExportModal}
        onClose={closeExportModal}
        modalState={exportModalState}
        exportError={exportError}
        exportStatus={exportProgress}
        isStarting={isStarting}
        isGettingDownload={isGettingDownload}
        onStartExport={startExport}
        onDownload={downloadExport}
        onRetry={handleExportRetry}
      />

      {/* Realignment Modal */}
      <RealignmentModal
        isOpen={!!realignmentComponent}
        onClose={handleCloseRealignment}
        component={realignmentComponent}
        smePersonas={wizardData?.smePersonas ?? []}
        audiencePersonas={wizardData?.audiencePersonas ?? []}
        learningObjectives={currentLessonLOs}
        onRealign={handleRealign}
        isLoading={isRealigning || isRegenerating}
      />
    </div>
  );
}
