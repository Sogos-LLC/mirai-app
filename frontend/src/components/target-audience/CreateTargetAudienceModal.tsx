'use client';

import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import type { ExperienceLevel } from '@/gen/mirai/v1/target_audience_pb';

interface CreateTargetAudienceModalProps {
  onClose: () => void;
  onCreate: (data: CreateTargetAudienceData) => Promise<void>;
}

export interface CreateTargetAudienceData {
  name: string;
  description: string;
  role: string;
  experienceLevel: ExperienceLevel;
  learningGoals: string[];
  prerequisites: string[];
  challenges: string[];
  motivations: string[];
  industryContext?: string;
  typicalBackground?: string;
}

const EXPERIENCE_OPTIONS = [
  { value: 1, label: 'Beginner', description: 'New to the topic, minimal prior knowledge' },
  { value: 2, label: 'Intermediate', description: 'Some experience, looking to deepen knowledge' },
  { value: 3, label: 'Advanced', description: 'Strong foundation, seeking mastery' },
  { value: 4, label: 'Expert', description: 'Deep expertise, looking for specialized content' },
];

export function CreateTargetAudienceModal({ onClose, onCreate }: CreateTargetAudienceModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(1);
  const [learningGoals, setLearningGoals] = useState<string[]>(['']);
  const [prerequisites, setPrerequisites] = useState<string[]>(['']);
  const [challenges, setChallenges] = useState<string[]>(['']);
  const [motivations, setMotivations] = useState<string[]>(['']);
  const [industryContext, setIndustryContext] = useState('');
  const [typicalBackground, setTypicalBackground] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await onCreate({
        name,
        description,
        role,
        experienceLevel,
        learningGoals: learningGoals.filter((g) => g.trim()),
        prerequisites: prerequisites.filter((p) => p.trim()),
        challenges: challenges.filter((c) => c.trim()),
        motivations: motivations.filter((m) => m.trim()),
        industryContext: industryContext || undefined,
        typicalBackground: typicalBackground || undefined,
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create target audience template');
      }
      setLoading(false);
    }
  };

  const addListItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => [...prev, '']);
  };

  const updateListItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const removeListItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const renderListInput = (
    label: string,
    items: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    placeholder: string
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => updateListItem(setter, index, e.target.value)}
              placeholder={placeholder}
              className="flex-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm border-gray-300 rounded-md px-3 py-2 border min-h-[40px]"
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeListItem(setter, index)}
                className="px-2 text-red-500 hover:text-red-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => addListItem(setter)}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
        >
          <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add another
        </button>
      </div>
    </div>
  );

  return (
    <ResponsiveModal isOpen={true} onClose={onClose} title="Create Target Audience Template">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        {/* Step Indicator */}
        <div className="flex items-center justify-center mb-6">
          <div className="flex items-center space-x-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <button
                  type="button"
                  onClick={() => setStep(s)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    step === s
                      ? 'bg-blue-600 text-white'
                      : step > s
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {step > s ? '✓' : s}
                </button>
                {s < 3 && <div className="w-8 h-0.5 bg-gray-200 mx-1" />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Template Name *
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border min-h-[44px]"
                  placeholder="New Sales Representatives, Senior Engineers..."
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border"
                  placeholder="Brief description of this target audience..."
                />
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                  Job Role *
                </label>
                <input
                  type="text"
                  id="role"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border min-h-[44px]"
                  placeholder="Sales Representative, Software Engineer..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Experience Level *
                </label>
                <div className="space-y-2">
                  {EXPERIENCE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                        experienceLevel === option.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="experienceLevel"
                        value={option.value}
                        checked={experienceLevel === option.value}
                        onChange={() => setExperienceLevel(option.value)}
                        className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="ml-3">
                        <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                        <span className="block text-xs text-gray-500">{option.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Goals & Prerequisites */}
          {step === 2 && (
            <div className="space-y-6">
              {renderListInput('Learning Goals *', learningGoals, setLearningGoals, 'What should they learn?')}
              {renderListInput('Prerequisites', prerequisites, setPrerequisites, 'What should they know beforehand?')}
              {renderListInput('Challenges', challenges, setChallenges, 'What problems do they face?')}
              {renderListInput('Motivations', motivations, setMotivations, 'Why do they need this training?')}
            </div>
          )}

          {/* Step 3: Additional Context */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="industryContext" className="block text-sm font-medium text-gray-700 mb-1">
                  Industry Context
                </label>
                <textarea
                  id="industryContext"
                  rows={3}
                  value={industryContext}
                  onChange={(e) => setIndustryContext(e.target.value)}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border"
                  placeholder="Industry-specific terminology, regulations, or context..."
                />
              </div>

              <div>
                <label htmlFor="typicalBackground" className="block text-sm font-medium text-gray-700 mb-1">
                  Typical Background
                </label>
                <textarea
                  id="typicalBackground"
                  rows={3}
                  value={typicalBackground}
                  onChange={(e) => setTypicalBackground(e.target.value)}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border"
                  placeholder="Educational background, work history, or relevant experience..."
                />
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Summary</h4>
                <dl className="text-sm space-y-1">
                  <div className="flex">
                    <dt className="text-gray-500 w-24">Name:</dt>
                    <dd className="text-gray-900">{name || '-'}</dd>
                  </div>
                  <div className="flex">
                    <dt className="text-gray-500 w-24">Role:</dt>
                    <dd className="text-gray-900">{role || '-'}</dd>
                  </div>
                  <div className="flex">
                    <dt className="text-gray-500 w-24">Level:</dt>
                    <dd className="text-gray-900">
                      {EXPERIENCE_OPTIONS.find((o) => o.value === experienceLevel)?.label || '-'}
                    </dd>
                  </div>
                  <div className="flex">
                    <dt className="text-gray-500 w-24">Goals:</dt>
                    <dd className="text-gray-900">{learningGoals.filter((g) => g.trim()).length} items</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 mt-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 pt-4 border-t border-gray-200">
          {step === 1 ? (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-3 lg:py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium min-h-[44px]"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-3 lg:py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium min-h-[44px]"
            >
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && (!name.trim() || !role.trim())}
              className="w-full sm:w-auto px-4 py-3 lg:py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading || !name.trim() || !role.trim() || learningGoals.filter((g) => g.trim()).length === 0}
              className="w-full sm:w-auto px-4 py-3 lg:py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {loading ? 'Creating...' : 'Create Template'}
            </button>
          )}
        </div>
      </form>
    </ResponsiveModal>
  );
}
