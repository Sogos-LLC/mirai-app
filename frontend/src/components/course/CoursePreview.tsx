'use client';

import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import {
  Download,
  Share2,
  Check,
  ChevronLeft,
  ChevronRight,
  Menu,
  X
} from 'lucide-react';
import { setCurrentStep } from '@/store/slices/courseSlice';
import { docOMaticCourseSections, docOMaticFinalExam } from '@/lib/docOMaticMockData';

export default function CoursePreview() {
  const dispatch = useDispatch();
  const course = useSelector((state: RootState) => state.course.currentCourse);
  const courseBlocks = useSelector((state: RootState) => state.course.courseBlocks);

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [quizAnswers, setQuizAnswers] = useState<{[key: string]: number}>({});
  const [showQuizFeedback, setShowQuizFeedback] = useState<{[key: string]: boolean}>({});
  const [examAnswers, setExamAnswers] = useState<{[key: string]: number}>({});
  const [showExamResults, setShowExamResults] = useState(false);

  const currentSection = docOMaticCourseSections[currentSectionIndex];
  const currentLesson = currentSection?.lessons[currentLessonIndex];

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
      if (currentLessonIndex < currentSection.lessons.length - 1) {
        setCurrentLessonIndex(currentLessonIndex + 1);
      } else if (currentSectionIndex < docOMaticCourseSections.length - 1) {
        setCurrentSectionIndex(currentSectionIndex + 1);
        setCurrentLessonIndex(0);
      }
    } else {
      if (currentLessonIndex > 0) {
        setCurrentLessonIndex(currentLessonIndex - 1);
      } else if (currentSectionIndex > 0) {
        setCurrentSectionIndex(currentSectionIndex - 1);
        const prevSection = docOMaticCourseSections[currentSectionIndex - 1];
        setCurrentLessonIndex(prevSection.lessons.length - 1);
      }
    }
  };

  const renderBlockContent = (block: any) => {
    switch (block.type) {
      case 'heading':
        return <h2 className="text-2xl font-bold text-gray-900 mb-4">{block.content}</h2>;
      case 'text':
        return <p className="text-gray-700 leading-relaxed mb-4 whitespace-pre-wrap">{block.content}</p>;
      case 'interactive':
        return (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-4">
            <div className="flex items-center gap-2 text-blue-700 mb-2">
              <span className="font-semibold">Interactive Activity</span>
            </div>
            <p className="text-gray-700">{block.content}</p>
            <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Start Activity
            </button>
          </div>
        );
      case 'knowledgeCheck':
        try {
          const quizData = JSON.parse(block.content);
          const selectedAnswer = quizAnswers[block.id];
          const showFeedback = showQuizFeedback[block.id];

          return (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-6 mb-4">
              <div className="flex items-center gap-2 text-green-700 mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold">Knowledge Check</span>
              </div>

              <p className="text-gray-800 font-medium mb-4">{quizData.question}</p>

              <div className="space-y-2 mb-4">
                {quizData.options.map((option: string, index: number) => (
                  <label
                    key={index}
                    className={`block p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedAnswer === index
                        ? showFeedback
                          ? index === quizData.correctAnswer
                            ? 'border-green-500 bg-green-100'
                            : 'border-red-500 bg-red-100'
                          : 'border-green-400 bg-green-50'
                        : 'border-gray-200 hover:border-green-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`quiz-${block.id}`}
                      value={index}
                      checked={selectedAnswer === index}
                      onChange={() => setQuizAnswers({...quizAnswers, [block.id]: index})}
                      className="mr-3"
                      disabled={showFeedback}
                    />
                    <span className={`${showFeedback && index === quizData.correctAnswer ? 'font-semibold text-green-700' : ''}`}>
                      {option}
                    </span>
                  </label>
                ))}
              </div>

              {!showFeedback ? (
                <button
                  onClick={() => setShowQuizFeedback({...showQuizFeedback, [block.id]: true})}
                  disabled={selectedAnswer === undefined}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Answer
                </button>
              ) : (
                <div className={`p-4 rounded-lg ${selectedAnswer === quizData.correctAnswer ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {selectedAnswer === quizData.correctAnswer ? (
                    <p className="font-semibold">✅ Correct!</p>
                  ) : (
                    <p className="font-semibold">❌ Not quite right.</p>
                  )}
                  <p className="mt-2">{quizData.explanation}</p>
                </div>
              )}
            </div>
          );
        } catch (e) {
          // Fallback for old format
          return (
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 mb-4">
              <div className="flex items-center gap-2 text-green-700 mb-2">
                <span className="font-semibold">Knowledge Check</span>
              </div>
              <p className="text-gray-700">{block.content}</p>
            </div>
          );
        }
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full bg-gray-50">
      {/* Sidebar Navigation */}
      {showSidebar && (
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-xl font-bold text-gray-900">{course.title}</h1>
            <p className="text-sm text-gray-600 mt-2">{course.desiredOutcome}</p>
          </div>

          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-4">Course Content</h3>
            {docOMaticCourseSections.map((section, sIndex) => (
              <div key={section.id} className="mb-4">
                <h4
                  className={`font-medium mb-2 ${
                    sIndex === currentSectionIndex ? 'text-purple-600' : 'text-gray-900'
                  }`}
                >
                  {section.name}
                </h4>
                <div className="ml-4 space-y-1">
                  {section.lessons.map((lesson, lIndex) => (
                    <button
                      key={lesson.id}
                      onClick={() => {
                        setCurrentSectionIndex(sIndex);
                        setCurrentLessonIndex(lIndex);
                      }}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        sIndex === currentSectionIndex && lIndex === currentLessonIndex
                          ? 'bg-purple-100 text-purple-700 font-medium'
                          : 'hover:bg-gray-100 text-gray-600'
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
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                {showSidebar ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div>
                <div className="text-sm text-gray-500">{currentSection?.name}</div>
                <div className="font-medium text-gray-900">{currentLesson?.title}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => dispatch(setCurrentStep(4))}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Back to Editor
              </button>
              <button
                onClick={() => setShowExportModal(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                <Download size={18} />
                Export to SCORM
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-8">
            {/* Check if this is the final exam lesson */}
            {currentSection?.id === 'section-4' && currentLesson?.id === 'lesson-4-1' ? (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg p-8">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    {docOMaticFinalExam.title}
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Test your knowledge with this comprehensive exam covering all course materials.
                    You need {docOMaticFinalExam.passingScore}% or higher to pass.
                  </p>

                  {!showExamResults ? (
                    <>
                      {docOMaticFinalExam.questions.map((question, index) => (
                        <div key={question.id} className="bg-white rounded-lg p-6 mb-4 border border-gray-200">
                          <p className="font-semibold text-gray-800 mb-4">
                            {index + 1}. {question.question}
                          </p>
                          <div className="space-y-2">
                            {question.options.map((option, optIndex) => (
                              <label
                                key={optIndex}
                                className={`block p-3 rounded-lg border cursor-pointer transition-all ${
                                  examAnswers[question.id] === optIndex
                                    ? 'border-purple-400 bg-purple-50'
                                    : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`exam-${question.id}`}
                                  value={optIndex}
                                  checked={examAnswers[question.id] === optIndex}
                                  onChange={() => setExamAnswers({...examAnswers, [question.id]: optIndex})}
                                  className="mr-3"
                                />
                                {option}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}

                      <button
                        onClick={() => setShowExamResults(true)}
                        disabled={Object.keys(examAnswers).length < docOMaticFinalExam.questions.length}
                        className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                      >
                        Submit Exam
                      </button>
                    </>
                  ) : (
                    <div className="bg-white rounded-lg p-6">
                      {(() => {
                        const correctCount = docOMaticFinalExam.questions.filter(
                          q => examAnswers[q.id] === q.correctAnswer
                        ).length;
                        const score = Math.round((correctCount / docOMaticFinalExam.questions.length) * 100);
                        const passed = score >= docOMaticFinalExam.passingScore;

                        return (
                          <>
                            <div className={`text-center mb-6 p-6 rounded-lg ${passed ? 'bg-green-50' : 'bg-red-50'}`}>
                              <div className={`text-5xl font-bold mb-2 ${passed ? 'text-green-600' : 'text-red-600'}`}>
                                {score}%
                              </div>
                              <p className={`text-xl font-semibold ${passed ? 'text-green-700' : 'text-red-700'}`}>
                                {passed ? '🎉 Congratulations! You passed!' : '📚 Keep studying and try again!'}
                              </p>
                              <p className="text-gray-600 mt-2">
                                You got {correctCount} out of {docOMaticFinalExam.questions.length} questions correct
                              </p>
                            </div>

                            <div className="space-y-4">
                              {docOMaticFinalExam.questions.map((question, index) => {
                                const userAnswer = examAnswers[question.id];
                                const isCorrect = userAnswer === question.correctAnswer;

                                return (
                                  <div key={question.id} className="border-l-4 pl-4" style={{borderColor: isCorrect ? '#10b981' : '#ef4444'}}>
                                    <p className="font-medium mb-2">
                                      {index + 1}. {question.question}
                                    </p>
                                    <p className="text-sm">
                                      Your answer: <span className={isCorrect ? 'text-green-600' : 'text-red-600'}>
                                        {question.options[userAnswer]}
                                      </span>
                                    </p>
                                    {!isCorrect && (
                                      <p className="text-sm text-gray-600 mt-1">
                                        Correct answer: <span className="text-green-600">
                                          {question.options[question.correctAnswer]}
                                        </span>
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            <button
                              onClick={() => {
                                setExamAnswers({});
                                setShowExamResults(false);
                              }}
                              className="mt-6 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                            >
                              Retake Exam
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Render lesson blocks normally */
              currentLesson?.blocks?.map((block) => (
                <div key={block.id}>
                  {renderBlockContent(block)}
                </div>
              ))
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-12 pt-6 border-t border-gray-200">
              <button
                onClick={() => navigateLesson('prev')}
                disabled={currentSectionIndex === 0 && currentLessonIndex === 0}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={20} />
                Previous
              </button>

              <div className="flex gap-2">
                {docOMaticCourseSections.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full ${
                      index === currentSectionIndex ? 'bg-purple-600' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={() => navigateLesson('next')}
                disabled={
                  currentSectionIndex === docOMaticCourseSections.length - 1 &&
                  currentLessonIndex === currentSection.lessons.length - 1
                }
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Export to SCORM</h3>

            {!exportComplete ? (
              <>
                <p className="text-gray-600 mb-6">
                  Your course will be exported as a SCORM 1.2 compliant package that can be
                  imported directly into any LMS.
                </p>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3">
                    <Check className="text-green-500" size={20} />
                    <span className="text-sm">SCORM 1.2 compliant</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="text-green-500" size={20} />
                    <span className="text-sm">Ready for LMS import</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="text-green-500" size={20} />
                    <span className="text-sm">Includes all media and assessments</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    disabled={isExporting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isExporting ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download size={18} />
                        Export
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="text-green-600" size={32} />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">Export Complete!</h4>
                <p className="text-gray-600">
                  Your SCORM package has been downloaded successfully.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}