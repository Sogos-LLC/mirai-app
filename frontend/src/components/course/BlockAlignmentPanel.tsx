'use client';

import React from 'react';
import { X, RefreshCw } from 'lucide-react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { BlockAlignment } from '@/types';

interface BlockAlignmentPanelProps {
  blockId: string;
  alignment: BlockAlignment | undefined;
  onUpdate: (alignment: BlockAlignment) => void;
  onClose: () => void;
  onRegenerate: () => void;
}

export default function BlockAlignmentPanel({
  blockId,
  alignment,
  onUpdate,
  onClose,
  onRegenerate
}: BlockAlignmentPanelProps) {
  const personas = useSelector((state: RootState) => state.course.currentCourse.personas || []);
  const objectives = useSelector((state: RootState) => state.course.currentCourse.learningObjectives || []);

  const currentAlignment = alignment || {
    personas: [],
    learningObjectives: [],
    kpis: []
  };

  const togglePersona = (personaId: string) => {
    const newPersonas = currentAlignment.personas.includes(personaId)
      ? currentAlignment.personas.filter(id => id !== personaId)
      : [...currentAlignment.personas, personaId];

    onUpdate({
      ...currentAlignment,
      personas: newPersonas
    });
  };

  const toggleObjective = (objectiveId: string) => {
    const newObjectives = currentAlignment.learningObjectives.includes(objectiveId)
      ? currentAlignment.learningObjectives.filter(id => id !== objectiveId)
      : [...currentAlignment.learningObjectives, objectiveId];

    onUpdate({
      ...currentAlignment,
      learningObjectives: newObjectives
    });
  };

  return (
    <div className="absolute right-0 top-0 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h4 className="font-semibold text-gray-900">Block Alignment</h4>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
        {/* Aligned To Label */}
        <div>
          <p className="text-sm text-gray-600 mb-3">
            Align this content block to specific personas and learning objectives
          </p>
        </div>

        {/* Personas Section */}
        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-2">Target Personas</h5>
          <div className="space-y-2">
            {personas.map((persona) => (
              <label
                key={persona.id}
                className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={currentAlignment.personas.includes(persona.id)}
                  onChange={() => togglePersona(persona.id)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700">{persona.role}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Learning Objectives Section */}
        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-2">Learning Objectives</h5>
          <div className="space-y-2">
            {objectives.map((objective, index) => (
              <label
                key={objective.id}
                className="flex items-start gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={currentAlignment.learningObjectives.includes(objective.id)}
                  onChange={() => toggleObjective(objective.id)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 mt-0.5"
                />
                <span className="text-sm text-gray-700">
                  <span className="font-medium">Objective {index + 1}:</span> {objective.text}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* KPIs Section */}
        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-2">Persona KPIs</h5>
          <div className="space-y-2">
            {personas.map((persona) => {
              const kpiId = `${persona.id}-kpi`;
              return (
                <label
                  key={kpiId}
                  className="flex items-start gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={currentAlignment.kpis.includes(kpiId)}
                    onChange={() => {
                      const newKpis = currentAlignment.kpis.includes(kpiId)
                        ? currentAlignment.kpis.filter(id => id !== kpiId)
                        : [...currentAlignment.kpis, kpiId];
                      onUpdate({
                        ...currentAlignment,
                        kpis: newKpis
                      });
                    }}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 mt-0.5"
                  />
                  <span className="text-sm text-gray-700">
                    <span className="font-medium">{persona.role} KPIs:</span>
                    <span className="block text-xs text-gray-600 mt-1">{persona.kpis}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={onRegenerate}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors"
        >
          <RefreshCw size={16} />
          Regenerate Block
        </button>
      </div>
    </div>
  );
}