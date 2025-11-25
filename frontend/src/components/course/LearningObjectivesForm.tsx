'use client';

import React, { useState, useEffect } from 'react';
import { Plus, X, GripVertical } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { setLearningObjectives } from '@/store/slices/courseSlice';
import {
  startGeneration,
  updateProgress,
  completeGeneration
} from '@/store/slices/aiGenerationSlice';
import AIGenerateButton from '@/components/ai/AIGenerateButton';
import { aiGeneratedContent, mockGenerationDelays } from '@/lib/docOMaticMockData';
import { LearningObjective } from '@/types';

export default function LearningObjectivesForm() {
  const dispatch = useDispatch();
  const learningObjectives = useSelector(
    (state: RootState) => state.course.currentCourse.learningObjectives || []
  );
  const courseTitle = useSelector(
    (state: RootState) => state.course.currentCourse.title
  );
  const { isGenerating } = useSelector((state: RootState) => state.aiGeneration);

  const [objectives, setObjectives] = useState<string[]>(['']); // Start with one empty field
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);

  useEffect(() => {
    if (learningObjectives.length > 0) {
      setObjectives(learningObjectives.map(obj => obj.text));
    } else {
      // Start with one empty objective field if there are no objectives
      setObjectives(['']);
    }
  }, [learningObjectives]);

  const handleObjectiveChange = (index: number, value: string) => {
    const newObjectives = [...objectives];
    newObjectives[index] = value;
    setObjectives(newObjectives);
    // Only save to Redux, don't modify the local state
    saveObjectivesToRedux(newObjectives);
  };

  const addObjective = () => {
    if (objectives.length < 20) {
      const newObjectives = [...objectives, ''];
      setObjectives(newObjectives);
      saveObjectivesToRedux(newObjectives);
    }
  };

  const removeObjective = (index: number) => {
    if (objectives.length > 1) {
      const newObjectives = objectives.filter((_, i) => i !== index);
      setObjectives(newObjectives);
      saveObjectivesToRedux(newObjectives);
    }
  };

  const saveObjectivesToRedux = (objectivesList: string[]) => {
    // Only save non-empty objectives to Redux
    const learningObjectives: LearningObjective[] = objectivesList
      .map((text, index) => ({
        id: `obj-${index + 1}`,
        text: text,
      }))
      .filter(obj => obj.text.trim().length > 0);  // Filter after mapping to preserve IDs
    dispatch(setLearningObjectives(learningObjectives));
  };

  const handleAutoGenerate = async () => {
    setIsAutoGenerating(true);
    dispatch(startGeneration({ type: 'objectives' }));

    // Simulate AI generation with progress updates
    const steps = [
      { progress: 20, message: 'Analyzing course title and context...' },
      { progress: 40, message: 'Identifying key learning outcomes...' },
      { progress: 60, message: 'Structuring objectives for maximum impact...' },
      { progress: 80, message: 'Aligning with industry best practices...' },
      { progress: 100, message: 'Finalizing learning objectives...' },
    ];

    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, mockGenerationDelays.learningObjectives / 5));
      dispatch(updateProgress(step));
    }

    // Set the generated objectives
    setObjectives(aiGeneratedContent.learningObjectives);
    saveObjectivesToRedux(aiGeneratedContent.learningObjectives);

    dispatch(completeGeneration());
    setIsAutoGenerating(false);
  };

  const moveObjective = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= objectives.length) return;

    const newObjectives = [...objectives];
    [newObjectives[fromIndex], newObjectives[toIndex]] =
    [newObjectives[toIndex], newObjectives[fromIndex]];
    setObjectives(newObjectives);
    saveObjectivesToRedux(newObjectives);
  };

  return (
    <div className="space-y-6">
      {/* Header with AI Generate */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Learning Objectives</h3>
          <p className="text-sm text-gray-600 mt-1">
            Define what learners will be able to do after completing the course
          </p>
        </div>
        <AIGenerateButton
          onClick={handleAutoGenerate}
          label="Auto-Generate"
          isGenerating={isAutoGenerating}
          disabled={!courseTitle}
        />
      </div>

      {/* Objectives List */}
      <div className="space-y-3">
        {objectives.map((objective, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:border-purple-300 transition-colors"
          >
            {/* Drag Handle */}
            <button
              className="mt-1 text-gray-400 hover:text-gray-600 cursor-move"
              title="Drag to reorder"
            >
              <GripVertical size={20} />
            </button>

            {/* Objective Number */}
            <div className="flex-shrink-0 w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-semibold">
              {index + 1}
            </div>

            {/* Objective Input */}
            <div className="flex-1">
              <textarea
                value={objective}
                onChange={(e) => handleObjectiveChange(index, e.target.value)}
                placeholder={`Learning objective ${index + 1}: e.g., "Apply advanced negotiation techniques in sales conversations"`}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={2}
              />
            </div>

            {/* Move Buttons */}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => moveObjective(index, 'up')}
                disabled={index === 0}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                title="Move up"
              >
                ↑
              </button>
              <button
                onClick={() => moveObjective(index, 'down')}
                disabled={index === objectives.length - 1}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                title="Move down"
              >
                ↓
              </button>
            </div>

            {/* Remove Button */}
            {objectives.length > 1 && (
              <button
                onClick={() => removeObjective(index)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Remove objective"
              >
                <X size={20} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Objective Button */}
      {objectives.length < 20 && (
        <button
          onClick={addObjective}
          className="flex items-center gap-2 px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
        >
          <Plus size={20} />
          <span>Add Learning Objective</span>
        </button>
      )}

      {/* Helper Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          <strong>💡 Tip:</strong> Well-written learning objectives use action verbs and are measurable.
          Start with verbs like: Apply, Analyze, Create, Demonstrate, or Evaluate.
        </p>
      </div>
    </div>
  );
}