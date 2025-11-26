'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store';
import { resetCourse } from '@/store/slices/courseSlice';
import { Sparkles, Upload } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

interface CourseCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CourseCreationModal({ isOpen, onClose }: CourseCreationModalProps) {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

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
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Choose Creation Method"
      size="lg"
    >
      <div className="flex flex-col h-full">
        {/* Content */}
        <div className="flex-1">
          <p className="text-gray-600 mb-4 lg:mb-6 text-sm lg:text-base">
            Select how you'd like to create your course.
          </p>

          <div className="grid gap-3 lg:gap-4">
            {/* Prompt-Based Option */}
            <button
              onClick={handlePromptBasedClick}
              className="group relative bg-gradient-to-r from-primary-100 to-primary-50 border-2 border-primary-200 rounded-xl p-4 lg:p-6 text-left hover:border-primary-400 hover:shadow-lg transition-all duration-200 min-h-[100px]"
            >
              <div className="flex items-start gap-3 lg:gap-4">
                <div className="p-2 lg:p-3 bg-white rounded-lg shadow-sm group-hover:shadow-md transition-shadow flex-shrink-0">
                  <Sparkles className="w-6 h-6 lg:w-8 lg:h-8 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-1 lg:mb-2">
                    Create with AI Prompts
                  </h3>
                  <p className="text-gray-600 text-sm lg:text-base line-clamp-2 lg:line-clamp-none">
                    Design your course using AI prompts. Our intelligent system guides you step by step.
                  </p>
                  <div className="mt-2 lg:mt-3 text-primary-600 font-medium text-sm">
                    Recommended for new courses
                  </div>
                </div>
              </div>
            </button>

            {/* Import Option */}
            <button
              onClick={handleImportClick}
              className="group relative bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4 lg:p-6 text-left hover:border-blue-400 hover:shadow-lg transition-all duration-200 min-h-[100px]"
            >
              <div className="flex items-start gap-3 lg:gap-4">
                <div className="p-2 lg:p-3 bg-white rounded-lg shadow-sm group-hover:shadow-md transition-shadow flex-shrink-0">
                  <Upload className="w-6 h-6 lg:w-8 lg:h-8 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-1 lg:mb-2">
                    Import Your Documents
                  </h3>
                  <p className="text-gray-600 text-sm lg:text-base line-clamp-2 lg:line-clamp-none">
                    Import PDF, DOCX, or MP4 files to transform existing materials into courses.
                  </p>
                  <div className="mt-2 lg:mt-3 text-blue-600 font-medium text-sm">
                    Best for existing content
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 lg:mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full py-3 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium min-h-[44px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </ResponsiveModal>
  );
}