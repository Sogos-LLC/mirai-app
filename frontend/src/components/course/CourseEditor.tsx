'use client';

import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
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
  X
} from 'lucide-react';
import CourseBlock from './CourseBlock';
import BlockAlignmentPanel from './BlockAlignmentPanel';
import DropdownMenu from '@/components/ui/DropdownMenu';
import { docOMaticCourseBlocks, docOMaticCourseSections } from '@/lib/docOMaticMockData';
import {
  addCourseBlock,
  updateCourseBlock,
  removeCourseBlock,
  setActiveBlockId,
  reorderCourseBlocks,
  setCurrentStep,
  saveCourse
} from '@/store/slices/courseSlice';
import { CourseBlock as CourseBlockType, BlockType } from '@/types';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/useBreakpoint';
import { BottomSheet } from '@/components/ui/BottomSheet';

export default function CourseEditor() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const isMobile = useIsMobile();
  const course = useSelector((state: RootState) => state.course.currentCourse);
  const courseBlocks = useSelector((state: RootState) => state.course.courseBlocks);
  const activeBlockId = useSelector((state: RootState) => state.course.activeBlockId);

  const [showAlignmentPanel, setShowAlignmentPanel] = useState(false);
  const [selectedSection, setSelectedSection] = useState('section-1');
  const [showAddBlockMenu, setShowAddBlockMenu] = useState(false);
  const [collapsedSummary, setCollapsedSummary] = useState(false);
  const [showMobileStructure, setShowMobileStructure] = useState(false);

  // Initialize course blocks from saved course data
  useEffect(() => {
    // Only add mock data if there are no blocks AND no saved content
    if (courseBlocks.length === 0) {
      // Check if course has saved content blocks
      if (course.content?.courseBlocks && course.content.courseBlocks.length > 0) {
        // Load the saved course blocks
        course.content.courseBlocks.forEach((block: CourseBlockType) => {
          dispatch(addCourseBlock(block));
        });
      } else {
        // Fallback to mock data only if no saved content exists
        docOMaticCourseBlocks.forEach(block => {
          dispatch(addCourseBlock(block));
        });
      }
    }
  }, [course.content]);

  const handleBlockUpdate = (block: CourseBlockType) => {
    dispatch(updateCourseBlock({ id: block.id, block }));
  };

  const handleBlockDelete = (blockId: string) => {
    dispatch(removeCourseBlock(blockId));
    if (activeBlockId === blockId) {
      dispatch(setActiveBlockId(null));
      setShowAlignmentPanel(false);
    }
  };

  const handleAlignmentClick = (blockId: string) => {
    dispatch(setActiveBlockId(blockId));
    setShowAlignmentPanel(true);
  };

  const handleAlignmentUpdate = (alignment: any) => {
    if (activeBlockId) {
      const block = courseBlocks.find(b => b.id === activeBlockId);
      if (block) {
        handleBlockUpdate({ ...block, alignment });
      }
    }
  };

  const handleAddBlock = (type: BlockType) => {
    const newBlock: CourseBlockType = {
      id: `block-${Date.now()}`,
      type,
      content: getDefaultContent(type),
      order: courseBlocks.length,
    };
    dispatch(addCourseBlock(newBlock));
    setShowAddBlockMenu(false);
  };

  const getDefaultContent = (type: BlockType) => {
    switch (type) {
      case 'heading':
        return 'New Section Heading';
      case 'text':
        return 'Enter your content here. This text block can contain detailed explanations, examples, and supporting information for your learners.';
      case 'interactive':
        return 'Interactive exercise: Learners will engage with this content through activities, simulations, or practice scenarios.';
      case 'knowledgeCheck':
        return 'Test your understanding: Complete this knowledge check to reinforce your learning.';
      default:
        return '';
    }
  };

  const activeBlock = courseBlocks.find(b => b.id === activeBlockId);

  // Course structure sidebar content (reused in both desktop sidebar and mobile sheet)
  const courseStructureContent = (
    <div className="space-y-2">
      {docOMaticCourseSections.map((section) => (
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
          {selectedSection === section.id && (
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
                    <h2 className="text-lg font-semibold text-gray-900">{course.title || 'Untitled Course'}</h2>
                    <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      Step 4 of 5: Edit Content
                    </span>
                  </div>
                  {!collapsedSummary && (
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      <p><strong>Outcome:</strong> {course.desiredOutcome}</p>
                      <p><strong>Objectives:</strong> {course.learningObjectives?.length || 0} defined</p>
                      <p><strong>Personas:</strong> {course.personas?.map(p => p.role).join(', ')}</p>
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
                      label: 'Back to Review',
                      icon: <ArrowLeft className="w-4 h-4" />,
                      onClick: () => dispatch(setCurrentStep(3)),
                    },
                    {
                      label: '',
                      divider: true,
                    },
                    {
                      label: 'Edit Course Settings',
                      icon: <Settings className="w-4 h-4" />,
                      onClick: () => dispatch(setCurrentStep(1)),
                    },
                    {
                      label: 'Edit Learning Objectives',
                      icon: <FileText className="w-4 h-4" />,
                      onClick: () => dispatch(setCurrentStep(2)),
                    },
                    {
                      label: '',
                      divider: true,
                    },
                    {
                      label: 'Save & Exit',
                      icon: <Save className="w-4 h-4" />,
                      onClick: async () => {
                        if (course.id) {
                          await dispatch(saveCourse({
                            id: course.id,
                            courseData: {
                              ...course,
                              content: {
                                sections: course.sections || [],
                                courseBlocks: courseBlocks || [],
                              },
                            },
                          }));
                        }
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
          {courseBlocks.map((block) => (
            <CourseBlock
              key={block.id}
              block={block}
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
                  onClick={() => handleAddBlock('heading')}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 rounded text-left"
                >
                  <Type size={18} className="text-gray-600" />
                  <div>
                    <div className="font-medium">Heading Block</div>
                    <div className="text-xs text-gray-500">Section or topic heading</div>
                  </div>
                </button>
                <button
                  onClick={() => handleAddBlock('text')}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 rounded text-left"
                >
                  <FileText size={18} className="text-gray-600" />
                  <div>
                    <div className="font-medium">Text Block</div>
                    <div className="text-xs text-gray-500">Explanatory content</div>
                  </div>
                </button>
                <button
                  onClick={() => handleAddBlock('interactive')}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 rounded text-left"
                >
                  <MousePointer size={18} className="text-gray-600" />
                  <div>
                    <div className="font-medium">Interactive Block</div>
                    <div className="text-xs text-gray-500">Activities and exercises</div>
                  </div>
                </button>
                <button
                  onClick={() => handleAddBlock('knowledgeCheck')}
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
                onUpdate={handleAlignmentUpdate}
                onClose={() => {
                  setShowAlignmentPanel(false);
                  dispatch(setActiveBlockId(null));
                }}
                onRegenerate={() => {
                  console.log('Regenerating block:', activeBlock.id);
                }}
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
            dispatch(setActiveBlockId(null));
          }}
          title="Block Alignment"
          height="half"
        >
          {activeBlock && (
            <BlockAlignmentPanel
              blockId={activeBlock.id}
              alignment={activeBlock.alignment}
              onUpdate={handleAlignmentUpdate}
              onClose={() => {
                setShowAlignmentPanel(false);
                dispatch(setActiveBlockId(null));
              }}
              onRegenerate={() => {
                console.log('Regenerating block:', activeBlock.id);
              }}
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
        onClick={() => dispatch(setCurrentStep(5))}
      >
        <Eye size={20} />
        Preview Course
      </button>
    </div>
  );
}