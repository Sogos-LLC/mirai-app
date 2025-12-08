'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useCourseEditorStore } from '@/store/zustand/courseEditorStore';
import { useGetCourse, useUpdateCourse } from '@/hooks/useCourses';
import {
  Plus,
  Type,
  FileText,
  MousePointer,
  CheckCircle,
  ChevronDown,
  Eye,
  ArrowLeft,
  Settings,
  Save,
  Home,
  Menu,
} from 'lucide-react';
import CourseBlock from './CourseBlock';
import BlockAlignmentPanel from './BlockAlignmentPanel';
import DropdownMenu from '@/components/ui/DropdownMenu';
import {
  useRegenerateComponent,
  useGetJob,
  useGetGeneratedLesson,
  GenerationJobStatus,
} from '@/hooks/useAIGeneration';
import type { CourseBlock as CourseBlockType } from '@/gen/mirai/v1/course_pb';
import { BlockType } from '@/gen/mirai/v1/course_pb';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/useBreakpoint';
import { BottomSheet } from '@/components/ui/BottomSheet';

interface CourseEditorProps {
  courseId: string;
  onPreview: () => void;
}

export default function CourseEditor({ courseId, onPreview }: CourseEditorProps) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // Connect-Query: fetch course data
  const { data: course, isLoading } = useGetCourse(courseId);
  const updateCourseMutation = useUpdateCourse();

  // Zustand: UI state only
  const activeBlockId = useCourseEditorStore((s) => s.activeBlockId);
  const setActiveBlockId = useCourseEditorStore((s) => s.setActiveBlockId);
  const markDirty = useCourseEditorStore((s) => s.markDirty);
  const markClean = useCourseEditorStore((s) => s.markClean);
  const setSaving = useCourseEditorStore((s) => s.setSaving);

  // Local state for editing blocks (derived from course data)
  const [localBlocks, setLocalBlocks] = useState<CourseBlockType[]>([]);
  const [showAlignmentPanel, setShowAlignmentPanel] = useState(false);
  const [selectedSection, setSelectedSection] = useState('section-1');
  const [showAddBlockMenu, setShowAddBlockMenu] = useState(false);
  const [collapsedSummary, setCollapsedSummary] = useState(false);
  const [showMobileStructure, setShowMobileStructure] = useState(false);

  // Block regeneration state
  const [regeneratingBlockId, setRegeneratingBlockId] = useState<string | null>(null);
  const [regenerationJobId, setRegenerationJobId] = useState<string | null>(null);

  // Regeneration hooks
  const regenerateHook = useRegenerateComponent();
  const { data: currentJob } = useGetJob(regenerationJobId || undefined);
  const activeBlock = localBlocks.find(b => b.id === activeBlockId);

  // Find lessonId for active block by searching through course sections/lessons
  const findLessonIdForBlock = (blockId: string): string | undefined => {
    const sections = course?.content?.sections || [];
    for (const section of sections) {
      for (const lesson of section.lessons || []) {
        const hasBlock = (lesson.blocks || []).some(b => b.id === blockId);
        if (hasBlock) return lesson.id;
      }
    }
    return undefined;
  };

  const activeBlockLessonId = activeBlockId ? findLessonIdForBlock(activeBlockId) : undefined;
  const { data: lesson, refetch: refetchLesson } = useGetGeneratedLesson(activeBlockLessonId);

  // Initialize local blocks from course data
  useEffect(() => {
    if (course?.content?.courseBlocks && course.content.courseBlocks.length > 0) {
      setLocalBlocks([...course.content.courseBlocks]);
    }
  }, [course?.content?.courseBlocks]);

  // Watch for regeneration job completion
  useEffect(() => {
    if (!currentJob || !regenerationJobId || !regeneratingBlockId) return;

    if (currentJob.status === GenerationJobStatus.COMPLETED) {
      refetchLesson().then(() => {
        const block = localBlocks.find(b => b.id === regeneratingBlockId);
        const updatedComponent = lesson?.components.find((c) => c.id === regeneratingBlockId);
        if (updatedComponent && block) {
          // Update block with regenerated content, preserving order and alignment
          const newBlock: CourseBlockType = {
            ...block,
            content: updatedComponent.contentJson, // contentJson holds the JSON string content
          };
          handleBlockUpdate(newBlock);
        }
        setRegeneratingBlockId(null);
        setRegenerationJobId(null);
      });
    } else if (currentJob.status === GenerationJobStatus.FAILED) {
      console.error('Regeneration failed:', currentJob.errorMessage);
      setRegeneratingBlockId(null);
      setRegenerationJobId(null);
    }
  }, [currentJob, regenerationJobId, regeneratingBlockId, lesson, localBlocks, refetchLesson]);

  // Handle regeneration from BlockAlignmentPanel
  const handleBlockRegenerate = useCallback(async () => {
    if (!activeBlock || !courseId || !activeBlockLessonId) {
      console.warn('Cannot regenerate: missing courseId or lessonId');
      return;
    }

    setRegeneratingBlockId(activeBlock.id);
    try {
      const result = await regenerateHook.mutate({
        courseId: courseId,
        generatedLessonId: activeBlockLessonId,
        componentId: activeBlock.id,
        modificationPrompt: 'Regenerate this content with the current alignment settings',
      });

      if (result.job) {
        setRegenerationJobId(result.job.id);
      }
    } catch (error) {
      console.error('Failed to start regeneration:', error);
      setRegeneratingBlockId(null);
    }
  }, [activeBlock, activeBlockLessonId, courseId, regenerateHook]);

  const handleBlockUpdate = (updatedBlock: CourseBlockType) => {
    setLocalBlocks(blocks =>
      blocks.map(b => b.id === updatedBlock.id ? updatedBlock : b)
    );
    markDirty();
  };

  const handleBlockDelete = (blockId: string) => {
    setLocalBlocks(blocks => blocks.filter(b => b.id !== blockId));
    if (activeBlockId === blockId) {
      setActiveBlockId(null);
      setShowAlignmentPanel(false);
    }
    markDirty();
  };

  const handleAlignmentClick = (blockId: string) => {
    setActiveBlockId(blockId);
    setShowAlignmentPanel(true);
  };

  const handleAlignmentUpdate = (alignment: Partial<{ personas: string[]; learningObjectives: string[]; kpis: string[] }>) => {
    if (activeBlockId) {
      const block = localBlocks.find(b => b.id === activeBlockId);
      if (block) {
        // Merge with existing alignment, providing defaults for any missing arrays
        const currentAlignment = block.alignment || { personas: [], learningObjectives: [], kpis: [] };
        const updatedAlignment = {
          personas: alignment.personas ?? currentAlignment.personas ?? [],
          learningObjectives: alignment.learningObjectives ?? currentAlignment.learningObjectives ?? [],
          kpis: alignment.kpis ?? currentAlignment.kpis ?? [],
        };
        handleBlockUpdate({ ...block, alignment: updatedAlignment } as CourseBlockType);
      }
    }
  };

  const handleAddBlock = (type: BlockType) => {
    const newBlock: CourseBlockType = {
      id: `block-${Date.now()}`,
      type,
      content: getDefaultContent(type),
      order: localBlocks.length,
    } as CourseBlockType;
    setLocalBlocks(blocks => [...blocks, newBlock]);
    setShowAddBlockMenu(false);
    markDirty();
  };

  const getDefaultContent = (type: BlockType) => {
    switch (type) {
      case BlockType.HEADING:
        return 'New Section Heading';
      case BlockType.TEXT:
        return 'Enter your content here. This text block can contain detailed explanations, examples, and supporting information for your learners.';
      case BlockType.INTERACTIVE:
        return 'Interactive exercise: Learners will engage with this content through activities, simulations, or practice scenarios.';
      case BlockType.KNOWLEDGE_CHECK:
        return 'Test your understanding: Complete this knowledge check to reinforce your learning.';
      default:
        return '';
    }
  };

  // Save course content
  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCourseMutation.mutate(courseId, {
        content: {
          sections: course?.content?.sections || [],
          courseBlocks: localBlocks,
        },
      });
      markClean();
    } catch (error) {
      console.error('Failed to save course:', error);
    } finally {
      setSaving(false);
    }
  };

  // Course structure sidebar content
  const sections = course?.content?.sections || [];
  const courseStructureContent = (
    <div className="space-y-2">
      {sections.map((section) => (
        <div key={section.id}>
          <button
            onClick={() => {
              setSelectedSection(section.id);
              if (isMobile) setShowMobileStructure(false);
            }}
            className={`w-full text-left px-3 py-3 lg:py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              selectedSection === section.id
                ? 'bg-purple-100 text-purple-700'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            {section.name}
          </button>
          {selectedSection === section.id && section.lessons && (
            <div className="ml-4 mt-1 space-y-1">
              {section.lessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="px-3 py-2 lg:py-1.5 text-sm lg:text-xs text-gray-600 hover:text-gray-900 cursor-pointer min-h-[44px] lg:min-h-0 flex items-center"
                >
                  {lesson.title}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const settings = course?.settings;
  const personas = course?.personas || [];
  const learningObjectives = course?.learningObjectives || [];

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Mobile: Structure toggle button */}
      {isMobile && (
        <div className="bg-gray-50 border-b border-gray-200 p-3">
          <button
            onClick={() => setShowMobileStructure(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 min-h-[44px]"
          >
            <Menu className="w-4 h-4" />
            Course Structure
          </button>
        </div>
      )}

      {/* Mobile: Structure bottom sheet */}
      <BottomSheet
        isOpen={showMobileStructure}
        onClose={() => setShowMobileStructure(false)}
        title="Course Structure"
        height="half"
      >
        {courseStructureContent}
      </BottomSheet>

      {/* Desktop: Left Sidebar - Course Structure */}
      <div className="hidden lg:block w-64 bg-gray-50 border-r border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Course Structure</h3>
        {courseStructureContent}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Course Summary Bar */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="p-4">
            <div className="flex items-start justify-between">
              <button
                onClick={() => setCollapsedSummary(!collapsedSummary)}
                className="flex items-center justify-between flex-grow"
              >
                <div className="text-left">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-gray-900">{settings?.title || 'Untitled Course'}</h2>
                    <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      Step 6 of 7: Edit Content
                    </span>
                  </div>
                  {!collapsedSummary && (
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      <p><strong>Outcome:</strong> {settings?.desiredOutcome}</p>
                      <p><strong>Objectives:</strong> {learningObjectives.length} defined</p>
                      <p><strong>Personas:</strong> {personas.map(p => p.role).join(', ')}</p>
                    </div>
                  )}
                </div>
                <ChevronDown
                  size={20}
                  className={`text-gray-400 transition-transform ml-4 ${
                    collapsedSummary ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Navigation Menu */}
              <div className="ml-4 flex items-center gap-2">
                <DropdownMenu
                  triggerIcon="dots"
                  align="right"
                  items={[
                    {
                      label: 'Save & Exit',
                      icon: <Save className="w-4 h-4" />,
                      onClick: async () => {
                        await handleSave();
                        router.push('/dashboard');
                      },
                    },
                    {
                      label: 'Exit Without Saving',
                      icon: <Home className="w-4 h-4" />,
                      onClick: () => router.push('/dashboard'),
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Blocks Container */}
        <div className="p-6 space-y-4 relative">
          {localBlocks.map((block) => (
            <CourseBlock
              key={block.id}
              block={block}
              courseId={courseId}
              generatedLessonId={findLessonIdForBlock(block.id)}
              onUpdate={handleBlockUpdate}
              onDelete={handleBlockDelete}
              onAlignmentClick={handleAlignmentClick}
              isActive={block.id === activeBlockId}
            />
          ))}

          {/* Add Block Button */}
          <div className="relative">
            <button
              onClick={() => setShowAddBlockMenu(!showAddBlockMenu)}
              className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors flex items-center justify-center gap-2 text-gray-600 hover:text-purple-600"
            >
              <Plus size={20} />
              <span>Add Content Block</span>
            </button>

            {/* Add Block Menu */}
            {showAddBlockMenu && (
              <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 rounded-lg shadow-xl p-2 z-20">
                <button
                  onClick={() => handleAddBlock(BlockType.HEADING)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 rounded text-left"
                >
                  <Type size={18} className="text-gray-600" />
                  <div>
                    <div className="font-medium">Heading Block</div>
                    <div className="text-xs text-gray-500">Section or topic heading</div>
                  </div>
                </button>
                <button
                  onClick={() => handleAddBlock(BlockType.TEXT)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 rounded text-left"
                >
                  <FileText size={18} className="text-gray-600" />
                  <div>
                    <div className="font-medium">Text Block</div>
                    <div className="text-xs text-gray-500">Explanatory content</div>
                  </div>
                </button>
                <button
                  onClick={() => handleAddBlock(BlockType.INTERACTIVE)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 rounded text-left"
                >
                  <MousePointer size={18} className="text-gray-600" />
                  <div>
                    <div className="font-medium">Interactive Block</div>
                    <div className="text-xs text-gray-500">Activities and exercises</div>
                  </div>
                </button>
                <button
                  onClick={() => handleAddBlock(BlockType.KNOWLEDGE_CHECK)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 rounded text-left"
                >
                  <CheckCircle size={18} className="text-gray-600" />
                  <div>
                    <div className="font-medium">Knowledge Check</div>
                    <div className="text-xs text-gray-500">Quiz or assessment</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Desktop: Alignment Panel */}
          {!isMobile && showAlignmentPanel && activeBlock && (
            <div className="fixed right-4 top-32">
              <BlockAlignmentPanel
                blockId={activeBlock.id}
                alignment={activeBlock.alignment}
                personas={course?.personas || []}
                objectives={course?.learningObjectives || []}
                onUpdate={handleAlignmentUpdate}
                onClose={() => {
                  setShowAlignmentPanel(false);
                  setActiveBlockId(null);
                }}
                onRegenerate={handleBlockRegenerate}
                isRegenerating={regeneratingBlockId === activeBlock.id}
              />
            </div>
          )}
        </div>
      </div>

      {/* Mobile: Alignment Panel as BottomSheet */}
      {isMobile && (
        <BottomSheet
          isOpen={showAlignmentPanel && !!activeBlock}
          onClose={() => {
            setShowAlignmentPanel(false);
            setActiveBlockId(null);
          }}
          title="Block Alignment"
          height="half"
        >
          {activeBlock && (
            <BlockAlignmentPanel
              blockId={activeBlock.id}
              alignment={activeBlock.alignment}
              personas={course?.personas || []}
              objectives={course?.learningObjectives || []}
              onUpdate={handleAlignmentUpdate}
              onClose={() => {
                setShowAlignmentPanel(false);
                setActiveBlockId(null);
              }}
              onRegenerate={handleBlockRegenerate}
              isRegenerating={regeneratingBlockId === activeBlock.id}
            />
          )}
        </BottomSheet>
      )}

      {/* Preview Button - Responsive positioning */}
      <button
        className={`
          fixed bg-purple-600 text-white font-medium shadow-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2
          ${isMobile
            ? 'bottom-20 left-4 right-4 py-4 rounded-xl'
            : 'bottom-6 right-6 px-6 py-3 rounded-lg'
          }
        `}
        onClick={onPreview}
      >
        <Eye size={20} />
        Preview Course
      </button>
    </div>
  );
}
