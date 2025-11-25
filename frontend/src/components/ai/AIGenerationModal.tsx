'use client';

import React, { useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { resetGeneration } from '@/store/slices/aiGenerationSlice';

interface AIGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIGenerationModal({ isOpen, onClose }: AIGenerationModalProps) {
  const dispatch = useDispatch();
  const { isGenerating, progress, currentMessage, generationType } = useSelector(
    (state: RootState) => state.aiGeneration
  );

  useEffect(() => {
    if (progress === 100 && !isGenerating) {
      const timer = setTimeout(() => {
        handleClose();
      }, 500); // Reduced from 1500ms to 500ms for quicker transition
      return () => clearTimeout(timer);
    }
  }, [progress, isGenerating]);

  const handleClose = () => {
    dispatch(resetGeneration());
    onClose();
  };

  if (!isOpen) return null;

  const getTitle = () => {
    switch (generationType) {
      case 'objectives':
        return 'Generating Learning Objectives';
      case 'personas':
        return 'Enriching Persona Details';
      case 'content':
        return 'Creating Course Content';
      case 'blocks':
        return 'Generating Content Blocks';
      default:
        return 'AI Generation in Progress';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="text-white animate-pulse" size={20} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{getTitle()}</h3>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isGenerating}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="relative">
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-purple-600 h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 text-sm text-gray-600 font-medium">
              {progress}% Complete
            </div>
          </div>

          {/* Current Message */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-700 min-h-[40px] flex items-center">
              {currentMessage}
            </p>
          </div>

          {/* AI Processing Animation */}
          {isGenerating && (
            <div className="flex justify-center space-x-2 py-4">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}

          {/* Success Message */}
          {progress === 100 && !isGenerating && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-700 font-medium text-center">
                ✨ Generation Complete! Your content is ready.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}