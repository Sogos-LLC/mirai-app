'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, User, Target, AlertCircle, Brain } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { updatePersona } from '@/store/slices/courseSlice';
import {
  startGeneration,
  updateProgress,
  completeGeneration
} from '@/store/slices/aiGenerationSlice';
import AIGenerateButton from '@/components/ai/AIGenerateButton';
import PersonaLearningObjectives from './PersonaLearningObjectives';
import { aiGeneratedContent, mockGenerationDelays, docOMaticPersonas, docOMaticLearningObjectives } from '@/lib/docOMaticMockData';
import { Persona, LearningObjective } from '@/types';

export default function PersonaDetailForm() {
  const dispatch = useDispatch();
  const personas = useSelector(
    (state: RootState) => state.course.currentCourse.personas || []
  );
  const [currentPersonaIndex, setCurrentPersonaIndex] = useState(0);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);

  const currentPersona = personas[currentPersonaIndex];

  const handleFieldChange = (field: keyof Persona, value: string) => {
    if (currentPersona) {
      dispatch(updatePersona({
        id: currentPersona.id,
        persona: { [field]: value }
      }));
    }
  };

  const handleAutoGenerate = async () => {
    if (!currentPersona) return;

    setIsAutoGenerating(true);
    dispatch(startGeneration({ type: 'personas' }));

    // Simulate AI generation with progress updates
    const steps = [
      { progress: 20, message: `Analyzing ${currentPersona.role || 'persona'} role requirements...` },
      { progress: 40, message: 'Identifying key challenges and pain points...' },
      { progress: 60, message: 'Generating personalized learning objectives...' },
      { progress: 80, message: 'Mapping required knowledge and skills...' },
      { progress: 100, message: 'Finalizing persona details...' },
    ];

    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, mockGenerationDelays.personas / 5));
      dispatch(updateProgress(step));
    }

    // Find matching mock persona data or use default
    const matchingMockPersona = docOMaticPersonas.find(p =>
      p.role.toLowerCase() === currentPersona.role?.toLowerCase() ||
      p.name.toLowerCase() === currentPersona.role?.toLowerCase()
    ) || docOMaticPersonas[0];

    // Generate persona-specific learning objectives
    const personaObjectives = generatePersonaObjectives(currentPersona.role);

    // Update persona with realistic fake data including learning objectives
    dispatch(updatePersona({
      id: currentPersona.id,
      persona: {
        responsibilities: matchingMockPersona.responsibilities,
        challenges: matchingMockPersona.challenges,
        concerns: matchingMockPersona.concerns,
        knowledge: matchingMockPersona.knowledge,
        learningObjectives: personaObjectives,
      }
    }));

    dispatch(completeGeneration());
    setIsAutoGenerating(false);
  };

  const generatePersonaObjectives = (role: string): LearningObjective[] => {
    // Generate role-specific objectives based on the persona
    const roleLC = role.toLowerCase();

    if (roleLC.includes('sales') || roleLC.includes('account')) {
      return [
        { id: `obj-${role}-1`, text: 'Articulate the unique value proposition effectively to prospects in their industry' },
        { id: `obj-${role}-2`, text: 'Conduct discovery calls that uncover critical business pain points' },
        { id: `obj-${role}-3`, text: 'Handle pricing objections with confidence using ROI calculations' },
      ];
    } else if (roleLC.includes('manager')) {
      return [
        { id: `obj-${role}-1`, text: 'Coach team members on advanced selling techniques and best practices' },
        { id: `obj-${role}-2`, text: 'Analyze pipeline metrics to identify areas for improvement' },
        { id: `obj-${role}-3`, text: 'Develop strategic account plans for high-value opportunities' },
      ];
    } else if (roleLC.includes('engineer') || roleLC.includes('technical')) {
      return [
        { id: `obj-${role}-1`, text: 'Demonstrate technical integrations tailored to customer environments' },
        { id: `obj-${role}-2`, text: 'Translate complex technical concepts into business benefits' },
        { id: `obj-${role}-3`, text: 'Design and execute successful proof-of-concept implementations' },
      ];
    } else {
      // Default objectives
      return docOMaticLearningObjectives.slice(0, 3).map((obj, index) => ({
        ...obj,
        id: `obj-${role}-${index + 1}`,
      }));
    }
  };

  const handleLearningObjectivesChange = (objectives: LearningObjective[]) => {
    if (currentPersona) {
      dispatch(updatePersona({
        id: currentPersona.id,
        persona: { learningObjectives: objectives }
      }));
    }
  };

  const handleAutoGenerateObjectives = async () => {
    if (!currentPersona) return;

    setIsAutoGenerating(true);
    dispatch(startGeneration({ type: 'objectives' }));

    const steps = [
      { progress: 33, message: `Analyzing ${currentPersona.role} learning needs...` },
      { progress: 66, message: 'Generating targeted objectives...' },
      { progress: 100, message: 'Finalizing learning outcomes...' },
    ];

    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, 500));
      dispatch(updateProgress(step));
    }

    const objectives = generatePersonaObjectives(currentPersona.role);
    dispatch(updatePersona({
      id: currentPersona.id,
      persona: { learningObjectives: objectives }
    }));

    dispatch(completeGeneration());
    setIsAutoGenerating(false);
  };

  const navigatePersona = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentPersonaIndex > 0) {
      setCurrentPersonaIndex(currentPersonaIndex - 1);
    } else if (direction === 'next' && currentPersonaIndex < personas.length - 1) {
      setCurrentPersonaIndex(currentPersonaIndex + 1);
    }
  };

  if (personas.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-700">
          No personas defined. Please go back to Step 1 to add target personas.
        </p>
      </div>
    );
  }

  if (!currentPersona) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header Section with Clear Persona Identification */}
      <div className="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-600 text-white rounded-lg">
              <User size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Persona Deep Dive</h3>
              <p className="text-sm text-gray-600">Define detailed characteristics for each target persona</p>
            </div>
          </div>
          <AIGenerateButton
            onClick={handleAutoGenerate}
            label="Auto-Fill Details"
            isGenerating={isAutoGenerating}
          />
        </div>

        {/* Current Persona Selector - Prominent Position */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigatePersona('prev')}
              disabled={currentPersonaIndex === 0}
              className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              aria-label="Previous persona"
            >
              <ChevronLeft size={24} />
            </button>

            <div className="flex-1 text-center">
              <div className="text-sm text-purple-600 font-medium uppercase tracking-wide">
                Currently Configuring
              </div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {currentPersona.role || `Persona ${currentPersonaIndex + 1}`}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                Persona {currentPersonaIndex + 1} of {personas.length}
              </div>

              {/* Quick Navigation Dots */}
              <div className="flex justify-center gap-2 mt-3">
                {personas.map((persona, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentPersonaIndex(index)}
                    className={`transition-all ${
                      index === currentPersonaIndex
                        ? 'w-8 h-2 bg-purple-600 rounded-full'
                        : 'w-2 h-2 bg-gray-300 hover:bg-gray-400 rounded-full'
                    }`}
                    title={`${persona.role || `Persona ${index + 1}`}`}
                    aria-label={`Go to ${persona.role || `Persona ${index + 1}`}`}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={() => navigatePersona('next')}
              disabled={currentPersonaIndex === personas.length - 1}
              className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              aria-label="Next persona"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          {/* KPIs Display if available */}
          {currentPersona.kpis && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Target size={16} className="text-purple-600" />
                <span className="text-sm font-medium text-gray-700">Key Performance Indicators:</span>
              </div>
              <p className="text-sm text-gray-600 pl-6">{currentPersona.kpis}</p>
            </div>
          )}
        </div>
      </div>

      {/* Persona Detail Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Primary Responsibilities */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <Target size={18} className="text-purple-600" />
              Primary Responsibilities
            </label>
            <textarea
              value={currentPersona.responsibilities || ''}
              onChange={(e) => handleFieldChange('responsibilities', e.target.value)}
              placeholder="Define the key responsibilities and daily tasks for this role..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all"
              rows={3}
            />
          </div>
        </div>

        {/* Challenges */}
        <div>
          <div className="bg-white rounded-lg border border-gray-200 p-5 h-full">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <AlertCircle size={18} className="text-orange-500" />
              Challenges They Face
            </label>
            <textarea
              value={currentPersona.challenges || ''}
              onChange={(e) => handleFieldChange('challenges', e.target.value)}
              placeholder="Describe the main obstacles and pain points they encounter..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all"
              rows={4}
            />
          </div>
        </div>

        {/* Primary Concerns */}
        <div>
          <div className="bg-white rounded-lg border border-gray-200 p-5 h-full">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <AlertCircle size={18} className="text-yellow-500" />
              Primary Concerns
            </label>
            <textarea
              value={currentPersona.concerns || ''}
              onChange={(e) => handleFieldChange('concerns', e.target.value)}
              placeholder="What keeps them up at night? What are they worried about?..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all"
              rows={4}
            />
          </div>
        </div>

        {/* Existing Knowledge */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
              <Brain size={18} className="text-blue-500" />
              Baseline Knowledge & Skills
            </label>
            <textarea
              value={currentPersona.knowledge || ''}
              onChange={(e) => handleFieldChange('knowledge', e.target.value)}
              placeholder="Describe the baseline knowledge and skills they should possess..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all"
              rows={3}
            />
          </div>
        </div>

        {/* Learning Objectives for this Persona */}
        <div className="md:col-span-2">
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border border-purple-200 p-5">
            <PersonaLearningObjectives
              objectives={currentPersona.learningObjectives || []}
              personaRole={currentPersona.role || `Persona ${currentPersonaIndex + 1}`}
              onChange={handleLearningObjectivesChange}
              onAutoGenerate={handleAutoGenerateObjectives}
              isGenerating={isAutoGenerating}
            />
          </div>
        </div>
      </div>
    </div>
  );
}