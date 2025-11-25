'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store';
import { resetCourse } from '@/store/slices/courseSlice';
import { X, Sparkles, Upload } from 'lucide-react';

interface CourseCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CourseCreationModal({ isOpen, onClose }: CourseCreationModalProps) {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  if (!isOpen) return null;

  const handlePromptBasedClick = () => {
    // Clear the existing course from Redux state
    dispatch(resetCourse());
    // Navigate to course builder for new course
    router.push('/course-builder');
    onClose();
  };

  const handleImportClick = () => {
    // TODO: Implement import functionality
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-900">
              Choose Your Course Creation Method
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-gray-600 mb-6">
              Select how you'd like to create your course. You can start from scratch with AI prompts or import existing materials.
            </p>

            <div className="grid gap-4">
              {/* Prompt-Based Option */}
              <button
                onClick={handlePromptBasedClick}
                className="group relative bg-gradient-to-r from-primary-100 to-primary-50 border-2 border-primary-200 rounded-xl p-6 text-left hover:border-primary-400 hover:shadow-lg transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white rounded-lg shadow-sm group-hover:shadow-md transition-shadow">
                    <Sparkles className="w-8 h-8 text-primary-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Create Course Using AI Prompts
                    </h3>
                    <p className="text-gray-600">
                      Design your course using AI prompts. Our intelligent system will guide you through creating engaging content step by step.
                    </p>
                    <div className="mt-3 text-primary-600 font-medium">
                      Recommended for new courses →
                    </div>
                  </div>
                </div>
              </button>

              {/* Import Option */}
              <button
                onClick={handleImportClick}
                className="group relative bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 text-left hover:border-blue-400 hover:shadow-lg transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white rounded-lg shadow-sm group-hover:shadow-md transition-shadow">
                    <Upload className="w-8 h-8 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Create Course Importing Your Documents
                    </h3>
                    <p className="text-gray-600">
                      Import PDF, DOCX, or MP4 files to start your development process. Transform your existing materials into interactive courses.
                    </p>
                    <div className="mt-3 text-blue-600 font-medium">
                      Best for existing content →
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6">
            <button
              onClick={onClose}
              className="w-full py-3 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}