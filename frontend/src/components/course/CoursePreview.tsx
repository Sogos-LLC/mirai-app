'use client';

import React, { useState } from 'react';
import { useGetCourse } from '@/hooks/useCourses';
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

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
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
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-600">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-400"></div>
      </div>
    );
  }

  if (!course || courseSections.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-dark-600">
        <p className="text-gray-500 dark:text-gray-400 mb-4">No course content available</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-dark-600">
      {/* Top Navigation Bar */}
      <div className="bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ChevronLeft size={20} />
            <span>Back to Editor</span>
          </button>
          <div className="h-6 w-px bg-gray-300 dark:bg-dark-border" />
          <h1 className="font-semibold text-gray-900 dark:text-white">{course.settings?.title || 'Course Preview'}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="lg:hidden p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-50 rounded-lg"
          >
            {showSidebar ? <X size={20} /> : <Menu size={20} />}
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Download size={18} />
            Export Course
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Course Structure */}
        <div className={`${showSidebar ? 'block' : 'hidden'} lg:block w-64 bg-white dark:bg-dark-surface border-r border-gray-200 dark:border-dark-border overflow-y-auto`}>
          <div className="p-4">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Course Content</h2>
            <div className="space-y-2">
              {courseSections.map((section, sIdx) => (
                <div key={section.id}>
                  <div className="font-medium text-gray-700 dark:text-gray-300 py-2">{section.name}</div>
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
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-50'
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

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {currentLesson ? (
              <>
                {/* Section & Lesson Header */}
                <div className="mb-6">
                  <div className="text-sm text-purple-600 dark:text-purple-400 font-medium mb-1">
                    {currentSection?.name}
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {currentLesson.title}
                  </h2>
                </div>

                {/* Lesson Content */}
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  {currentLesson.blocks?.map((block) => (
                    <div key={block.id} className="mb-6">
                      {block.type === 1 ? ( // HEADING
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{block.content}</h3>
                      ) : block.type === 4 ? ( // KNOWLEDGE_CHECK
                        (() => {
                          try {
                            const quiz = JSON.parse(block.content);
                            const quizId = block.id;
                            const selectedAnswer = quizAnswers[quizId];
                            const showFeedback = showQuizFeedback[quizId];
                            const isCorrect = selectedAnswer === quiz.correctAnswer;

                            return (
                              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800/40 rounded-lg p-6">
                                <h4 className="font-semibold text-green-800 dark:text-green-400 mb-3">Knowledge Check</h4>
                                <p className="text-gray-800 dark:text-white mb-4">{quiz.question}</p>
                                <div className="space-y-2">
                                  {quiz.options?.map((option: string, idx: number) => (
                                    <button
                                      key={idx}
                                      onClick={() => !showFeedback && handleQuizAnswer(quizId, idx)}
                                      disabled={showFeedback}
                                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                                        showFeedback
                                          ? idx === quiz.correctAnswer
                                            ? 'bg-green-100 dark:bg-green-900/40 border-green-500 text-green-800 dark:text-green-300'
                                            : idx === selectedAnswer
                                              ? 'bg-red-100 dark:bg-red-900/40 border-red-500 text-red-800 dark:text-red-300'
                                              : 'bg-white dark:bg-dark-400 border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300'
                                          : selectedAnswer === idx
                                            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-500 text-purple-800 dark:text-purple-300'
                                            : 'bg-white dark:bg-dark-400 border-gray-200 dark:border-dark-border hover:border-purple-300 dark:hover:border-purple-600 text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                                {!showFeedback && selectedAnswer !== undefined && (
                                  <button
                                    onClick={() => checkQuizAnswer(quizId)}
                                    className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                  >
                                    Check Answer
                                  </button>
                                )}
                                {showFeedback && (
                                  <div className={`mt-4 p-3 rounded-lg ${isCorrect ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                                    <p className={`font-medium ${isCorrect ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                                      {isCorrect ? 'Correct!' : 'Incorrect'}
                                    </p>
                                    {quiz.explanation && (
                                      <p className="text-gray-700 dark:text-gray-300 mt-1 text-sm">{quiz.explanation}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          } catch {
                            return <div className="text-gray-700 dark:text-gray-300">{block.content}</div>;
                          }
                        })()
                      ) : (
                        <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{block.content}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Navigation Buttons */}
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-dark-border flex justify-between">
                  <button
                    onClick={() => navigateLesson('prev')}
                    disabled={currentSectionIndex === 0 && currentLessonIndex === 0}
                    className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={20} />
                    Previous Lesson
                  </button>
                  <button
                    onClick={() => navigateLesson('next')}
                    disabled={
                      currentSectionIndex === courseSections.length - 1 &&
                      currentLessonIndex === (currentSection?.lessons?.length || 1) - 1
                    }
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next Lesson
                    <ChevronRight size={20} />
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">Select a lesson from the sidebar to begin.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-surface-elevated rounded-xl p-6 max-w-md w-full mx-4 dark:border dark:border-dark-border">
            {exportComplete ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Export Complete!</h3>
                <p className="text-gray-600 dark:text-gray-400">Your course has been exported successfully.</p>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Export Course</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Export your course to SCORM format for use in your LMS.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-50 text-gray-700 dark:text-gray-300"
                    disabled={isExporting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    {isExporting ? 'Exporting...' : 'Export SCORM'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
