'use client';

import React, { useState, useEffect } from 'react';
import { Plus, X, GripVertical, Sparkles } from 'lucide-react';
import { LearningObjective } from '@/types';

interface PersonaLearningObjectivesProps {
  objectives: LearningObjective[];
  personaRole: string;
  onChange: (objectives: LearningObjective[]) => void;
  onAutoGenerate?: () => void;
  isGenerating?: boolean;
}

export default function PersonaLearningObjectives({
  objectives,
  personaRole,
  onChange,
  onAutoGenerate,
  isGenerating = false
}: PersonaLearningObjectivesProps) {
  const [localObjectives, setLocalObjectives] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (objectives && objectives.length > 0) {
      setLocalObjectives(objectives.map(obj => obj.text));
    } else {
      // Start with one empty objective field
      setLocalObjectives(['']);
    }
  }, [objectives]);

  const handleObjectiveChange = (index: number, value: string) => {
    const newObjectives = [...localObjectives];
    newObjectives[index] = value;
    setLocalObjectives(newObjectives);
    saveObjectivesToParent(newObjectives);
  };

  const addObjective = () => {
    if (localObjectives.length < 5) { // Max 5 objectives per persona
      const newObjectives = [...localObjectives, ''];
      setLocalObjectives(newObjectives);
      saveObjectivesToParent(newObjectives);
    }
  };

  const removeObjective = (index: number) => {
    if (localObjectives.length > 1) {
      const newObjectives = localObjectives.filter((_, i) => i !== index);
      setLocalObjectives(newObjectives);
      saveObjectivesToParent(newObjectives);
    }
  };

  const saveObjectivesToParent = (objectivesList: string[]) => {
    const learningObjectives: LearningObjective[] = objectivesList
      .map((text, index) => ({
        id: `obj-${personaRole}-${index + 1}`,
        text: text,
      }));
    onChange(learningObjectives);
  };

  const moveObjective = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= localObjectives.length) return;

    const newObjectives = [...localObjectives];
    [newObjectives[fromIndex], newObjectives[toIndex]] =
    [newObjectives[toIndex], newObjectives[fromIndex]];
    setLocalObjectives(newObjectives);
    saveObjectivesToParent(newObjectives);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Add a slight opacity to the dragged element
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIndex(null);
    // Reset opacity
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newObjectives = [...localObjectives];
    const [draggedItem] = newObjectives.splice(draggedIndex, 1);
    newObjectives.splice(dropIndex, 0, draggedItem);

    setLocalObjectives(newObjectives);
    saveObjectivesToParent(newObjectives);
    setDraggedIndex(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Sparkles size={18} className="text-purple-600" />
          Learning Objectives for {personaRole}
        </label>
        {onAutoGenerate && (
          <button
            onClick={onAutoGenerate}
            disabled={isGenerating}
            className="px-3 py-1 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Auto-Generate
              </>
            )}
          </button>
        )}
      </div>

      {/* Objectives List */}
      <div className="space-y-3">
        {localObjectives.map((objective, index) => (
          <div
            key={index}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:border-purple-300 transition-colors cursor-move"
          >
            {/* Drag Handle */}
            <div
              className="mt-1 text-gray-400 hover:text-gray-600 cursor-move"
              title="Drag to reorder"
            >
              <GripVertical size={16} />
            </div>

            {/* Objective Number */}
            <div className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-semibold">
              {index + 1}
            </div>

            {/* Objective Input */}
            <div className="flex-1">
              <textarea
                value={objective}
                onChange={(e) => handleObjectiveChange(index, e.target.value)}
                placeholder={`What should ${personaRole} be able to do after completing this course?`}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-sm"
                rows={2}
              />
            </div>

            {/* Move Buttons */}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => moveObjective(index, 'up')}
                disabled={index === 0}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                title="Move up"
              >
                ↑
              </button>
              <button
                onClick={() => moveObjective(index, 'down')}
                disabled={index === localObjectives.length - 1}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                title="Move down"
              >
                ↓
              </button>
            </div>

            {/* Remove Button */}
            {localObjectives.length > 1 && (
              <button
                onClick={() => removeObjective(index)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Remove objective"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Objective Button */}
      {localObjectives.length < 5 && (
        <button
          onClick={addObjective}
          className="flex items-center gap-2 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
        >
          <Plus size={16} />
          <span>Add Learning Objective</span>
        </button>
      )}
    </div>
  );
}