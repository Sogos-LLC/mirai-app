'use client';

import React, { useState } from 'react';
import { useGetCourse } from '@/hooks/useCourses';
import { useIsMobile } from '@/hooks/useBreakpoint';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  Download,
  Check,
  ChevronLeft,
  ChevronRight,
  Menu,
  X
} from 'lucide-react';

interface CoursePreviewProps {
  courseId: string;
  onBack: () => void;
}

export default function CoursePreview({ courseId, onBack }: CoursePreviewProps) {
  // Connect-Query: fetch course data
  const { data: course, isLoading } = useGetCourse(courseId);
  const isMobile = useIsMobile();

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<{[key: string]: number}>({});
  const [showQuizFeedback, setShowQuizFeedback] = useState<{[key: string]: boolean}>({});

  // Use actual course content
  const courseSections = course?.content?.sections || [];
  const currentSection = courseSections[currentSectionIndex];
  const currentLesson = currentSection?.lessons?.[currentLessonIndex];

  const handleExport = async () => {
    setIsExporting(true);
    // Simulate export process
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsExporting(false);
    setExportComplete(true);

    // Auto-close modal after success
    setTimeout(() => {
      setShowExportModal(false);
      setExportComplete(false);
    }, 2000);
  };

  const navigateLesson = (direction: 'prev' | 'next') => {
    if (direction === 'next') {
      if (currentSection?.lessons && currentLessonIndex < currentSection.lessons.length - 1) {
        setCurrentLessonIndex(currentLessonIndex + 1);
      } else if (currentSectionIndex < courseSections.length - 1) {
        setCurrentSectionIndex(currentSectionIndex + 1);
        setCurrentLessonIndex(0);
      }
    } else {
      if (currentLessonIndex > 0) {
        setCurrentLessonIndex(currentLessonIndex - 1);
      } else if (currentSectionIndex > 0) {
        const prevSection = courseSections[currentSectionIndex - 1];
        setCurrentSectionIndex(currentSectionIndex - 1);
        setCurrentLessonIndex((prevSection?.lessons?.length || 1) - 1);
      }
    }
    // Reset quiz state when navigating
    setQuizAnswers({});
    setShowQuizFeedback({});
  };

  const handleQuizAnswer = (quizId: string, answerIndex: number) => {
    setQuizAnswers(prev => ({ ...prev, [quizId]: answerIndex }));
  };

  const checkQuizAnswer = (quizId: string) => {
    setShowQuizFeedback(prev => ({ ...prev, [quizId]: true }));
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-page">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-400"></div>
      </div>
    );
  }

  if (!course || courseSections.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-page">
        <p className="text-secondary mb-4">No course content available</p>
        <button
          onClick={onBack}
          className="min-h-[44px] px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-page">
      {/* Top Navigation Bar */}
      <div className="bg-surface border-b border px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="flex items-center gap-1 md:gap-2 text-secondary hover:text-primary min-h-[44px] touch-target shrink-0"
            aria-label="Back to Editor"
          >
            <ChevronLeft size={20} />
            <span className="hidden sm:inline">Back to Editor</span>
          </button>
          <div className="hidden sm:block h-6 w-px bg-border" />
          <h1 className="font-semibold text-primary truncate text-sm sm:text-base">{course.settings?.title || 'Course Preview'}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="min-h-[44px] min-w-[44px] p-2 text-secondary hover:bg-hover rounded-lg touch-target flex items-center justify-center"
            aria-label="Toggle lesson navigation"
          >
            <Menu size={20} />
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Export Course</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Course Structure (Desktop: sidebar, Mobile: BottomSheet) */}
        {isMobile ? (
          <BottomSheet
            isOpen={showSidebar}
            onClose={() => setShowSidebar(false)}
            title="Course Content"
            height="half"
            showDragHandle={true}
            showCloseButton={true}
          >
            <div className="space-y-2">
              {courseSections.map((section, sIdx) => (
                <div key={section.id}>
                  <div className="font-medium text-primary py-2">{section.name}</div>
                  <div className="ml-2 space-y-1">
                    {section.lessons?.map((lesson, lIdx) => (
                      <button
                        key={lesson.id}
                        onClick={() => {
                          setCurrentSectionIndex(sIdx);
                          setCurrentLessonIndex(lIdx);
                          setQuizAnswers({});
                          setShowQuizFeedback({});
                          setShowSidebar(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded text-sm min-h-[44px] touch-target ${
                          sIdx === currentSectionIndex && lIdx === currentLessonIndex
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                            : 'text-secondary hover:bg-hover'
                        }`}
                      >
                        {lesson.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </BottomSheet>
        ) : (
          <div className="w-64 bg-surface border-r border overflow-y-auto">
            <div className="p-4">
              <h2 className="font-semibold text-primary mb-4">Course Content</h2>
              <div className="space-y-2">
                {courseSections.map((section, sIdx) => (
                  <div key={section.id}>
                    <div className="font-medium text-primary py-2">{section.name}</div>
                    <div className="ml-2 space-y-1">
                      {section.lessons?.map((lesson, lIdx) => (
                        <button
                          key={lesson.id}
                          onClick={() => {
                            setCurrentSectionIndex(sIdx);
                            setCurrentLessonIndex(lIdx);
                            setQuizAnswers({});
                            setShowQuizFeedback({});
                          }}
                          className={`w-full text-left px-3 py-2 rounded text-sm ${
                            sIdx === currentSectionIndex && lIdx === currentLessonIndex
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                              : 'text-secondary hover:bg-hover'
                          }`}
                        >
                          {lesson.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
            {currentLesson ? (
              <>
                {/* Section & Lesson Header */}
                <div className="mb-4 sm:mb-6">
                  <div className="text-xs sm:text-sm text-purple-600 dark:text-purple-400 font-medium mb-1">
                    {currentSection?.name}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-primary">
                    {currentLesson.title}
                  </h2>
                </div>

                {/* Lesson Content */}
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  {currentLesson.blocks?.map((block) => (
                    <div key={block.id} className="mb-4 sm:mb-6">
                      {block.type === 1 ? ( // HEADING
                        <h3 className="text-lg sm:text-xl font-semibold text-primary">{block.content}</h3>
                      ) : block.type === 4 ? ( // KNOWLEDGE_CHECK
                        (() => {
                          try {
                            const quiz = JSON.parse(block.content);
                            const quizId = block.id;
                            const selectedAnswer = quizAnswers[quizId];
                            const showFeedback = showQuizFeedback[quizId];
                            const isCorrect = selectedAnswer === quiz.correctAnswer;

                            return (
                              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800/40 rounded-lg p-4 sm:p-6">
                                <h4 className="font-semibold text-green-800 dark:text-green-400 mb-3 text-sm sm:text-base">Knowledge Check</h4>
                                <p className="text-primary mb-4 text-sm sm:text-base">{quiz.question}</p>
                                <div className="space-y-2">
                                  {quiz.options?.map((option: string, idx: number) => (
                                    <button
                                      key={idx}
                                      onClick={() => !showFeedback && handleQuizAnswer(quizId, idx)}
                                      disabled={showFeedback}
                                      className={`w-full text-left px-3 sm:px-4 py-3 rounded-lg border transition-colors min-h-[44px] touch-target text-sm sm:text-base ${
                                        showFeedback
                                          ? idx === quiz.correctAnswer
                                            ? 'bg-green-100 dark:bg-green-900/40 border-green-500 text-green-800 dark:text-green-300'
                                            : idx === selectedAnswer
                                              ? 'bg-red-100 dark:bg-red-900/40 border-red-500 text-red-800 dark:text-red-300'
                                              : 'bg-surface border text-secondary'
                                          : selectedAnswer === idx
                                            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-500 text-purple-800 dark:text-purple-300'
                                            : 'bg-surface border hover:border-purple-300 dark:hover:border-purple-600 text-secondary'
                                      }`}
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                                {!showFeedback && selectedAnswer !== undefined && (
                                  <button
                                    onClick={() => checkQuizAnswer(quizId)}
                                    className="mt-4 px-4 py-2 min-h-[44px] bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm sm:text-base"
                                  >
                                    Check Answer
                                  </button>
                                )}
                                {showFeedback && (
                                  <div className={`mt-4 p-3 rounded-lg ${isCorrect ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                                    <p className={`font-medium text-sm sm:text-base ${isCorrect ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                                      {isCorrect ? 'Correct!' : 'Incorrect'}
                                    </p>
                                    {quiz.explanation && (
                                      <p className="text-secondary mt-1 text-xs sm:text-sm">{quiz.explanation}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          } catch {
                            return <div className="text-secondary">{block.content}</div>;
                          }
                        })()
                      ) : (
                        <div className="text-secondary whitespace-pre-wrap text-sm sm:text-base">{block.content}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Navigation Buttons */}
                <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border flex flex-col sm:flex-row gap-3 sm:justify-between">
                  <button
                    onClick={() => navigateLesson('prev')}
                    disabled={currentSectionIndex === 0 && currentLessonIndex === 0}
                    className="flex items-center justify-center sm:justify-start gap-2 px-4 py-2 min-h-[44px] text-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed order-2 sm:order-1"
                  >
                    <ChevronLeft size={20} />
                    <span>Previous Lesson</span>
                  </button>
                  <button
                    onClick={() => navigateLesson('next')}
                    disabled={
                      currentSectionIndex === courseSections.length - 1 &&
                      currentLessonIndex === (currentSection?.lessons?.length || 1) - 1
                    }
                    className="flex items-center justify-center sm:justify-start gap-2 px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2"
                  >
                    <span>Next Lesson</span>
                    <ChevronRight size={20} />
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-secondary">Select a lesson from the sidebar to begin.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export Modal */}
      <ResponsiveModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title={exportComplete ? "Export Complete!" : "Export Course"}
        size="md"
        mobileHeight="auto"
      >
        {exportComplete ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-primary mb-2">Export Complete!</h3>
            <p className="text-secondary">Your course has been exported successfully.</p>
          </div>
        ) : (
          <>
            <p className="text-secondary mb-6">
              Export your course to SCORM format for use in your LMS.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 px-4 py-2 min-h-[44px] border border rounded-lg hover:bg-hover text-secondary"
                disabled={isExporting}
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex-1 px-4 py-2 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {isExporting ? 'Exporting...' : 'Export SCORM'}
              </button>
            </div>
          </>
        )}
      </ResponsiveModal>
    </div>
  );
}
