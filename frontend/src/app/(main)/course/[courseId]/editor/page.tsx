'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Eye,
  Save,
  Plus,
  GripVertical,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
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
  MoreVertical,
  Pencil,
  Target,
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
import { useGetCourseOutline, useListGeneratedLessons, useUpdateLessonComponents, useRegenerateComponent, LessonComponentType } from '@/hooks/useAIGeneration';
import { ComponentRenderer } from '@/components/course/renderers/ComponentRenderer';
import { EditModal } from '@/components/course/modals/EditModal';
import { AddComponentModal } from '@/components/course/modals/AddComponentModal';
import { RealignmentModal, type RealignParams, type RealignResult, type LearningObjective } from '@/components/course/modals/RealignmentModal';
import { useCourseEditorStore, setOnSaveCallback, setOnPersistCallback, setOnPersistSuccessCallback } from '@/store/zustand/courseEditorStore';
import type { LessonComponent, GeneratedLesson, OutlineSection } from '@/gen/mirai/v1/ai_generation_types_pb';
import { useIsMobile } from '@/hooks/useBreakpoint';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  useExportCourse,
  useGetExportStatus,
  useDownloadExport,
  ExportFormat,
  ExportStatus,
} from '@/hooks/useExport';

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

function SortableComponent({
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

// "Add between" divider component
interface AddBetweenProps {
  onAdd: () => void;
}

function AddBetween({ onAdd }: AddBetweenProps) {
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

// Export modal states
type ExportModalState = 'idle' | 'starting' | 'processing' | 'completed' | 'failed';

export default function CourseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = params.courseId as string;
  const lessonIdFromUrl = searchParams.get('lessonId');
  const isMobile = useIsMobile();

  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(lessonIdFromUrl);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [localComponents, setLocalComponents] = useState<LessonComponent[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [addComponentAfterIndex, setAddComponentAfterIndex] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [deletingComponentId, setDeletingComponentId] = useState<string | null>(null);

  // Export state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportModalState, setExportModalState] = useState<ExportModalState>('idle');
  const [exportId, setExportId] = useState<string | undefined>(undefined);
  const [exportError, setExportError] = useState<string | null>(null);

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

  // Export hooks
  const { mutate: startExport, isLoading: isStarting, error: startError, reset: resetStart } = useExportCourse();
  const { data: exportStatus } = useGetExportStatus(exportId, { enabled: !!exportId });
  const { mutate: getDownload, isLoading: isGettingDownload } = useDownloadExport();

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

  // Update export modal state based on export status
  useEffect(() => {
    if (!exportStatus) return;

    switch (exportStatus.status) {
      case ExportStatus.PENDING:
      case ExportStatus.PROCESSING:
        setExportModalState('processing');
        break;
      case ExportStatus.COMPLETED:
        setExportModalState('completed');
        break;
      case ExportStatus.FAILED:
        setExportModalState('failed');
        setExportError(exportStatus.errorMessage || 'Export failed. Please try again.');
        break;
    }
  }, [exportStatus]);

  // Handle start error
  useEffect(() => {
    if (startError) {
      setExportModalState('failed');
      setExportError(startError.message || 'Failed to start export. Please try again.');
    }
  }, [startError]);

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
      // Find first lesson with generated content
      const firstWithContent = lessonsList.find((l) => !!l.generated);
      if (firstWithContent) {
        setSelectedLessonId(firstWithContent.id);
        // Expand the section containing this lesson
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

      // Update the specific component in the list and save all
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
    // Update component with the final content
    const finalComponent = { ...component, contentJson };

    // Insert at the specified position and reorder
    const insertIndex = addComponentAfterIndex ?? localComponents.length - 1;
    const newComponents = [...localComponents];
    newComponents.splice(insertIndex + 1, 0, finalComponent);
    // Update order for all components
    const reorderedComponents = newComponents.map((c, idx) => ({ ...c, order: idx }));

    setLocalComponents(reorderedComponents);
    // Sync ref immediately so persist callback can access the new component
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

  // Move component up in the list
  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setLocalComponents((items) => {
      const newItems = arrayMove(items, index, index - 1);
      return newItems.map((item, idx) => ({ ...item, order: idx }));
    });
    setHasChanges(true);
  }, []);

  // Move component down in the list
  const handleMoveDown = useCallback((index: number) => {
    setLocalComponents((items) => {
      if (index >= items.length - 1) return items;
      const newItems = arrayMove(items, index, index + 1);
      return newItems.map((item, idx) => ({ ...item, order: idx }));
    });
    setHasChanges(true);
  }, []);

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
    setExportError(null);
    try {
      const exportRecord = await startExport(courseId, ExportFormat.SCORM_2004);
      if (exportRecord) {
        setExportId(exportRecord.id);
        setExportModalState('processing');
      }
    } catch {
      // Error handled by useEffect above
    }
  };

  const handleDownload = useCallback(async () => {
    if (!exportId) return;
    try {
      const result = await getDownload(exportId);
      if (result.downloadUrl) {
        // Open download URL in new tab
        window.open(result.downloadUrl, '_blank');
      }
    } catch (err) {
      console.error('Failed to get download URL:', err);
    }
  }, [exportId, getDownload]);

  const resetExportModal = useCallback(() => {
    setExportId(undefined);
    setExportModalState('idle');
    setExportError(null);
    resetStart();
  }, [resetStart]);

  const handleCloseExportModal = useCallback(() => {
    setShowExportModal(false);
    // Reset state after animation
    setTimeout(resetExportModal, 300);
  }, [resetExportModal]);

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
      // Return job info for SSE tracking - modal will wait for COMPLETED event
      return { job: result.job };
    } catch (error) {
      console.error('Failed to realign component:', error);
      throw error; // Re-throw so the modal can show error state
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
      <ResponsiveModal
        isOpen={showExportModal}
        onClose={handleCloseExportModal}
        title={
          exportModalState === 'completed' ? "Export Complete!" :
          exportModalState === 'failed' ? "Export Failed" :
          "Export Course"
        }
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

        {/* Processing state - export in progress */}
        {exportModalState === 'processing' && (
          <div className="text-center py-6">
            <Loader2 className="w-12 h-12 text-purple-600 dark:text-purple-400 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-primary mb-2">Exporting Course...</h3>
            {exportStatus && (
              <>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2 mx-auto max-w-xs">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${exportStatus.progressPercent}%` }}
                  />
                </div>
                <p className="text-secondary text-sm">
                  {exportStatus.progressMessage || `${exportStatus.progressPercent}% complete`}
                </p>
              </>
            )}
          </div>
        )}

        {/* Completed state - export finished */}
        {exportModalState === 'completed' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-primary mb-2">Export Complete!</h3>
            <p className="text-secondary mb-6">Your course has been exported successfully.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCloseExportModal}
                className="flex-1 px-4 py-2 min-h-[44px] border border rounded-lg hover:bg-hover text-secondary"
              >
                Close
              </button>
              <button
                onClick={handleDownload}
                disabled={isGettingDownload}
                className="flex-1 px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Download size={18} />
                {isGettingDownload ? 'Getting Download...' : 'Download SCORM'}
              </button>
            </div>
          </div>
        )}

        {/* Failed state - export error */}
        {exportModalState === 'failed' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-semibold text-primary mb-2">Export Failed</h3>
            <p className="text-secondary mb-6">{exportError}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCloseExportModal}
                className="flex-1 px-4 py-2 min-h-[44px] border border rounded-lg hover:bg-hover text-secondary"
              >
                Close
              </button>
              <button
                onClick={() => {
                  resetExportModal();
                  handleExport();
                }}
                className="flex-1 px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </ResponsiveModal>

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

