'use client';

import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { Edit2, CheckCircle, AlertCircle } from 'lucide-react';
import { setCurrentStep, generateCourseSections, setAssessmentSettings, saveCourse } from '@/store/slices/courseSlice';
import {
  startGeneration,
  updateProgress,
  completeGeneration
} from '@/store/slices/aiGenerationSlice';
import { mockGenerationDelays, docOMaticCourseSections } from '@/lib/docOMaticMockData';

export default function CourseReviewStep() {
  const dispatch = useDispatch<AppDispatch>();
  const course = useSelector((state: RootState) => state.course.currentCourse);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleEdit = (step: number) => {
    dispatch(setCurrentStep(step));
  };

  const handleGenerateCourse = async () => {
    setIsGenerating(true);
    dispatch(startGeneration({ type: 'content' }));
    dispatch(generateCourseSections());

    // Simulate course generation with progress updates
    const steps = [
      { progress: 10, message: 'Analyzing course requirements...' },
      { progress: 25, message: 'Structuring course outline...' },
      { progress: 40, message: 'Generating introduction section...' },
      { progress: 55, message: 'Creating learning modules...' },
      { progress: 70, message: 'Adding interactive elements...' },
      { progress: 85, message: 'Inserting knowledge checks...' },
      { progress: 95, message: 'Finalizing course structure...' },
      { progress: 100, message: 'Course generation complete!' },
    ];

    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, mockGenerationDelays.courseContent / steps.length));
      dispatch(updateProgress(step));
    }

    // Save the generated course with content blocks and sections
    if (course.id) {
      // Add the generated course blocks to the course
      const courseDataToSave = {
        ...course,
        content: {
          sections: docOMaticCourseSections,
          courseBlocks: docOMaticCourseSections.flatMap(section =>
            section.lessons.flatMap(lesson => lesson.blocks || [])
          ),
        },
        status: 'generated' as const, // Mark as generated so we know to go to editor
      };

      await dispatch(saveCourse({
        id: course.id,
        courseData: courseDataToSave,
      }));
    }

    dispatch(completeGeneration());
    setIsGenerating(false);

    // Move to the next step (Course Editor) immediately
    dispatch(setCurrentStep(4));
  };

  const isReadyToGenerate = () => {
    const hasBasicInfo = course.title && course.desiredOutcome;
    const hasPersonas = (course.personas?.length ?? 0) > 0;

    // Check if at least one persona has learning objectives
    const hasLearningObjectives = course.personas?.some(
      persona => persona.learningObjectives && persona.learningObjectives.length > 0
    ) ?? false;

    return hasBasicInfo && hasPersonas && hasLearningObjectives;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Review Your Course Setup</h2>
        <p className="text-gray-600">
          Validate all inputs before generating your AI-powered course
        </p>
      </div>

      {/* Course Details Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Course Details</h3>
          <button
            onClick={() => handleEdit(1)}
            className="text-purple-600 hover:text-purple-700 text-sm flex items-center gap-1"
          >
            <Edit2 size={16} />
            Edit
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-500">Course Title</label>
            <p className="text-gray-900 mt-1">{course.title || 'Not specified'}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-500">Desired Outcome</label>
            <p className="text-gray-900 mt-1">{course.desiredOutcome || 'Not specified'}</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Destination Folder</label>
              <p className="text-gray-900 mt-1">{course.destinationFolder || 'Not selected'}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Category Tags</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {(course.categoryTags?.length ?? 0) > 0 ? (
                  course.categoryTags?.map((tag, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500">No tags</span>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Data Source</label>
              <p className="text-gray-900 mt-1">{course.dataSource || 'Not selected'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Target Personas with Learning Objectives Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Target Personas & Learning Objectives</h3>
          <button
            onClick={() => handleEdit(2)}
            className="text-purple-600 hover:text-purple-700 text-sm flex items-center gap-1"
          >
            <Edit2 size={16} />
            Edit
          </button>
        </div>

        {(course.personas?.length ?? 0) > 0 ? (
          <div className="space-y-6">
            {course.personas?.map((persona, personaIndex) => (
              <div key={persona.id} className="border-l-4 border-purple-500 pl-4">
                <div className="font-semibold text-lg text-gray-900 mb-2">{persona.role}</div>

                {/* Persona Details */}
                <div className="bg-gray-50 rounded-lg p-4 mb-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    {persona.kpis && (
                      <div>
                        <span className="font-medium text-gray-600">KPIs:</span>
                        <p className="text-gray-700 mt-1">{persona.kpis}</p>
                      </div>
                    )}
                    {persona.responsibilities && (
                      <div>
                        <span className="font-medium text-gray-600">Responsibilities:</span>
                        <p className="text-gray-700 mt-1">{persona.responsibilities}</p>
                      </div>
                    )}
                    {persona.challenges && (
                      <div>
                        <span className="font-medium text-gray-600">Challenges:</span>
                        <p className="text-gray-700 mt-1">{persona.challenges}</p>
                      </div>
                    )}
                    {persona.knowledge && (
                      <div>
                        <span className="font-medium text-gray-600">Baseline Knowledge:</span>
                        <p className="text-gray-700 mt-1">{persona.knowledge}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Learning Objectives for this Persona */}
                {persona.learningObjectives && persona.learningObjectives.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Learning Objectives:</h4>
                    <ol className="space-y-1">
                      {persona.learningObjectives.map((objective, index) => (
                        <li key={objective.id} className="flex items-start gap-2">
                          <span className="flex-shrink-0 w-5 h-5 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-semibold">
                            {index + 1}
                          </span>
                          <span className="text-sm text-gray-700">{objective.text}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No target personas defined</p>
        )}
      </div>

      {/* Assessment Settings Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Assessment Settings</h3>
        </div>

        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={course.assessmentSettings?.enableEmbeddedKnowledgeChecks ?? true}
              onChange={(e) => {
                dispatch(setAssessmentSettings({
                  enableEmbeddedKnowledgeChecks: e.target.checked
                }));
              }}
              className="mt-1 w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 focus:ring-2"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900">
                Include embedded knowledge checks
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Add one multiple choice quiz question per lesson to reinforce learning throughout the course
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={course.assessmentSettings?.enableFinalExam ?? true}
              onChange={(e) => {
                dispatch(setAssessmentSettings({
                  enableFinalExam: e.target.checked
                }));
              }}
              className="mt-1 w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 focus:ring-2"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900">
                Include final exam
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Add a comprehensive multiple choice exam at the end of the course covering all lessons
              </p>
            </div>
          </label>
        </div>

        {/* Display current settings summary */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            <span className="font-medium">Current settings:</span>
            <div className="mt-2 space-y-1">
              {(course.assessmentSettings?.enableEmbeddedKnowledgeChecks ?? true) && (
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-600" />
                  <span>Knowledge checks after each lesson</span>
                </div>
              )}
              {(course.assessmentSettings?.enableFinalExam ?? true) && (
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-600" />
                  <span>Final exam at course completion</span>
                </div>
              )}
              {!(course.assessmentSettings?.enableEmbeddedKnowledgeChecks ?? true) &&
               !(course.assessmentSettings?.enableFinalExam ?? true) && (
                <div className="text-gray-500">No assessments configured</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Validation Status */}
      <div className={`rounded-lg p-4 ${isReadyToGenerate() ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
        {isReadyToGenerate() ? (
          <div className="flex items-center gap-3">
            <CheckCircle className="text-green-600" size={20} />
            <div>
              <p className="font-medium text-green-900">Ready to Generate!</p>
              <p className="text-sm text-green-700 mt-1">
                All required information has been provided. Your course is ready to be generated.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <AlertCircle className="text-yellow-600" size={20} />
            <div>
              <p className="font-medium text-yellow-900">Missing Information</p>
              <p className="text-sm text-yellow-700 mt-1">
                Please complete all required fields before generating the course.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Generate Course Button */}
      <div className="flex justify-center pt-4">
        <button
          onClick={handleGenerateCourse}
          disabled={!isReadyToGenerate() || isGenerating}
          className={`
            px-8 py-3 rounded-lg font-semibold text-white
            transition-all duration-200 transform
            ${isReadyToGenerate() && !isGenerating
              ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 hover:scale-105 shadow-lg'
              : 'bg-gray-400 cursor-not-allowed'
            }
          `}
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating Course...
            </span>
          ) : (
            '✨ Generate Course'
          )}
        </button>
      </div>
    </div>
  );
}