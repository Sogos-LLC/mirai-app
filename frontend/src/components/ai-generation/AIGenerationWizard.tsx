'use client';

import { useState, useCallback } from 'react';
import { Tag, FolderOpen, X, Hash } from 'lucide-react';
import type { SubjectMatterExpert, SMEStatus } from '@/gen/mirai/v1/sme_pb';
import type { TargetAudienceTemplate, ExperienceLevel } from '@/gen/mirai/v1/target_audience_pb';
import type { CourseGenerationInput } from '@/gen/mirai/v1/ai_generation_pb';
import TagsSelectionModal from '@/components/course/TagsSelectionModal';
import FolderSelectionModal from '@/components/course/FolderSelectionModal';

// Step type for wizard navigation
type WizardStep = 'sme-selection' | 'audience-selection' | 'configuration' | 'organization' | 'review';

const STEPS: { key: WizardStep; label: string; description: string }[] = [
  { key: 'sme-selection', label: 'Knowledge Source', description: 'Select SMEs to use as content source' },
  { key: 'audience-selection', label: 'Target Audience', description: 'Choose who this course is for' },
  { key: 'configuration', label: 'Course Goals', description: 'Define learning outcomes' },
  { key: 'organization', label: 'Organization', description: 'Set tags and folder location' },
  { key: 'review', label: 'Review', description: 'Confirm and generate' },
];

interface WizardState {
  selectedSmeIds: string[];
  selectedAudienceIds: string[];
  desiredOutcome: string;
  additionalContext: string;
  categoryTags: string[];
  destinationFolder: string;
  destinationFolderName: string;
}

interface AIGenerationWizardProps {
  courseId: string;
  courseName: string;
  availableSmes: SubjectMatterExpert[];
  availableAudiences: TargetAudienceTemplate[];
  onStartGeneration: (input: CourseGenerationInput & { categoryTags?: string[]; destinationFolder?: string }) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function AIGenerationWizard({
  courseId,
  courseName,
  availableSmes,
  availableAudiences,
  onStartGeneration,
  onCancel,
  isLoading = false,
}: AIGenerationWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('sme-selection');
  const [state, setState] = useState<WizardState>({
    selectedSmeIds: [],
    selectedAudienceIds: [],
    desiredOutcome: '',
    additionalContext: '',
    categoryTags: [],
    destinationFolder: '',
    destinationFolderName: '',
  });

  // Modal states
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 'sme-selection':
        return state.selectedSmeIds.length > 0;
      case 'audience-selection':
        return state.selectedAudienceIds.length > 0;
      case 'configuration':
        return state.desiredOutcome.trim().length > 10;
      case 'organization':
        return true; // Tags and folder are optional
      case 'review':
        return true;
      default:
        return false;
    }
  }, [currentStep, state]);

  const goToNextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].key);
    }
  };

  const goToPreviousStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].key);
    }
  };

  const handleStartGeneration = () => {
    const input: CourseGenerationInput & { categoryTags?: string[]; destinationFolder?: string } = {
      $typeName: 'mirai.v1.CourseGenerationInput',
      courseId,
      smeIds: state.selectedSmeIds,
      targetAudienceIds: state.selectedAudienceIds,
      desiredOutcome: state.desiredOutcome,
      additionalContext: state.additionalContext || undefined,
      categoryTags: state.categoryTags.length > 0 ? state.categoryTags : undefined,
      destinationFolder: state.destinationFolder || undefined,
    };
    onStartGeneration(input);
  };

  const toggleSme = (smeId: string) => {
    setState((prev) => ({
      ...prev,
      selectedSmeIds: prev.selectedSmeIds.includes(smeId)
        ? prev.selectedSmeIds.filter((id) => id !== smeId)
        : [...prev.selectedSmeIds, smeId],
    }));
  };

  const toggleAudience = (audienceId: string) => {
    setState((prev) => ({
      ...prev,
      selectedAudienceIds: prev.selectedAudienceIds.includes(audienceId)
        ? prev.selectedAudienceIds.filter((id) => id !== audienceId)
        : [...prev.selectedAudienceIds, audienceId],
    }));
  };

  const handleTagsChange = (tags: string[]) => {
    setState((prev) => ({ ...prev, categoryTags: tags }));
  };

  const handleFolderSelect = (folderId: string, folderName: string) => {
    setState((prev) => ({
      ...prev,
      destinationFolder: folderId,
      destinationFolderName: folderName,
    }));
  };

  const removeTag = (tagToRemove: string) => {
    setState((prev) => ({
      ...prev,
      categoryTags: prev.categoryTags.filter((tag) => tag !== tagToRemove),
    }));
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
        <h2 className="text-xl font-semibold text-white">Generate Course Content</h2>
        <p className="text-indigo-100 text-sm mt-1">
          AI will create course content based on your SME knowledge
        </p>
      </div>

      {/* Progress Steps */}
      <div className="px-6 py-4 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                    ${
                      index < currentStepIndex
                        ? 'bg-indigo-600 text-white'
                        : index === currentStepIndex
                          ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                          : 'bg-gray-200 text-gray-500'
                    }
                  `}
                >
                  {index < currentStepIndex ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`mt-1 text-xs ${index <= currentStepIndex ? 'text-indigo-600 font-medium' : 'text-gray-500'}`}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-12 h-0.5 mx-2 ${index < currentStepIndex ? 'bg-indigo-600' : 'bg-gray-200'}`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="p-6 min-h-[400px]">
        {/* Step 1: SME Selection */}
        {currentStep === 'sme-selection' && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Select Knowledge Sources</h3>
            <p className="text-sm text-gray-500 mb-4">
              Choose the SMEs whose knowledge will be used to generate course content.
              You can select multiple SMEs to combine their expertise.
            </p>
            {availableSmes.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">No SMEs available</p>
                <p className="text-xs text-gray-400">Create an SME first to provide knowledge for the course</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableSmes.map((sme) => {
                  const isSelected = state.selectedSmeIds.includes(sme.id);
                  return (
                    <label
                      key={sme.id}
                      className={`
                        relative flex items-start p-4 border rounded-lg cursor-pointer transition-all
                        ${isSelected ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-gray-300'}
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSme(sme.id)}
                        className="h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500 mt-1"
                      />
                      <div className="ml-3 flex-1">
                        <span className="block text-sm font-medium text-gray-900">{sme.name}</span>
                        {sme.description && (
                          <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2">{sme.description}</span>
                        )}
                        <div className="flex items-center mt-2 gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                            {sme.scope === 1 ? 'Global' : 'Team'}
                          </span>
                          {sme.status === 3 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Audience Selection */}
        {currentStep === 'audience-selection' && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Select Target Audience</h3>
            <p className="text-sm text-gray-500 mb-4">
              Choose who this course is designed for. The AI will tailor content
              complexity, examples, and language to match the audience.
            </p>
            {availableAudiences.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">No target audiences defined</p>
                <p className="text-xs text-gray-400">Create a target audience profile first</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableAudiences.map((audience) => {
                  const isSelected = state.selectedAudienceIds.includes(audience.id);
                  return (
                    <label
                      key={audience.id}
                      className={`
                        relative flex items-start p-4 border rounded-lg cursor-pointer transition-all
                        ${isSelected ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-gray-300'}
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAudience(audience.id)}
                        className="h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500 mt-1"
                      />
                      <div className="ml-3 flex-1">
                        <span className="block text-sm font-medium text-gray-900">{audience.name}</span>
                        {audience.description && (
                          <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2">{audience.description}</span>
                        )}
                        <div className="flex flex-wrap items-center mt-2 gap-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                            {audience.experienceLevel === 1 ? 'Beginner' : audience.experienceLevel === 2 ? 'Intermediate' : 'Advanced'}
                          </span>
                          {audience.industryContext && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                              {audience.industryContext}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Configuration */}
        {currentStep === 'configuration' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Define Course Goals</h3>
            <p className="text-sm text-gray-500 mb-4">
              Describe what learners should be able to do after completing this course.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Desired Outcome <span className="text-red-500">*</span>
              </label>
              <textarea
                value={state.desiredOutcome}
                onChange={(e) => setState((prev) => ({ ...prev, desiredOutcome: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="By the end of this course, learners will be able to..."
              />
              <p className="mt-1 text-xs text-gray-500">
                Be specific about skills, knowledge, or capabilities (min 10 characters)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Context (optional)
              </label>
              <textarea
                value={state.additionalContext}
                onChange={(e) => setState((prev) => ({ ...prev, additionalContext: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Any specific requirements, constraints, or preferences..."
              />
              <p className="mt-1 text-xs text-gray-500">
                Mention any specific topics to include/exclude, tone preferences, or format requirements
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Organization */}
        {currentStep === 'organization' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Organize Your Course</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add tags for categorization and choose where to save the course in your library.
            </p>

            {/* Tags Section */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-5 h-5 text-gray-600" />
                  <h4 className="text-sm font-medium text-gray-900">Category Tags</h4>
                </div>
                <button
                  onClick={() => setShowTagsModal(true)}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  {state.categoryTags.length > 0 ? 'Edit Tags' : 'Add Tags'}
                </button>
              </div>

              {state.categoryTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {state.categoryTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium"
                    >
                      <Hash className="w-3 h-3" />
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:bg-indigo-200 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No tags selected. Tags help organize and find your courses.</p>
              )}
            </div>

            {/* Folder Section */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-gray-600" />
                  <h4 className="text-sm font-medium text-gray-900">Destination Folder</h4>
                </div>
                <button
                  onClick={() => setShowFolderModal(true)}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  {state.destinationFolder ? 'Change Folder' : 'Select Folder'}
                </button>
              </div>

              {state.destinationFolder ? (
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen className="w-4 h-4 text-yellow-600" />
                  <span className="font-medium text-gray-900">{state.destinationFolderName}</span>
                  <button
                    onClick={() => setState((prev) => ({ ...prev, destinationFolder: '', destinationFolderName: '' }))}
                    className="ml-2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No folder selected. The course will be saved to your default library location.</p>
              )}
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {currentStep === 'review' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Review Configuration</h3>
            <p className="text-sm text-gray-500 mb-4">
              Please review your selections before starting generation.
            </p>

            <div className="bg-gray-50 rounded-lg divide-y divide-gray-200">
              {/* Course Info */}
              <div className="p-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Course</h4>
                <p className="text-sm font-medium text-gray-900">{courseName}</p>
              </div>

              {/* SME Selection */}
              <div className="p-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Knowledge Sources ({state.selectedSmeIds.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {state.selectedSmeIds.map((id) => {
                    const sme = availableSmes.find((s) => s.id === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-indigo-100 text-indigo-800"
                      >
                        {sme?.name || id}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Audience Selection */}
              <div className="p-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Target Audience ({state.selectedAudienceIds.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {state.selectedAudienceIds.map((id) => {
                    const audience = availableAudiences.find((a) => a.id === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                      >
                        {audience?.name || id}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Desired Outcome */}
              <div className="p-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Desired Outcome</h4>
                <p className="text-sm text-gray-900">{state.desiredOutcome}</p>
              </div>

              {/* Additional Context */}
              {state.additionalContext && (
                <div className="p-4">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Additional Context</h4>
                  <p className="text-sm text-gray-700">{state.additionalContext}</p>
                </div>
              )}

              {/* Tags */}
              {state.categoryTags.length > 0 && (
                <div className="p-4">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Tags ({state.categoryTags.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {state.categoryTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700"
                      >
                        <Hash className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Folder */}
              {state.destinationFolder && (
                <div className="p-4">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Destination Folder</h4>
                  <div className="flex items-center gap-2 text-sm">
                    <FolderOpen className="w-4 h-4 text-yellow-600" />
                    <span className="font-medium text-gray-900">{state.destinationFolderName}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex">
                <svg className="h-5 w-5 text-amber-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-amber-800">What happens next?</h4>
                  <p className="mt-1 text-sm text-amber-700">
                    AI will first generate a course outline for your review. You can edit, approve,
                    or request changes before full content generation begins.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
        <div>
          {currentStepIndex > 0 && (
            <button
              type="button"
              onClick={goToPreviousStep}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
            >
              Back
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          {currentStep === 'review' ? (
            <button
              type="button"
              onClick={handleStartGeneration}
              disabled={isLoading || !canProceed()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Starting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Course
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={goToNextStep}
              disabled={!canProceed()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      <TagsSelectionModal
        isOpen={showTagsModal}
        onClose={() => setShowTagsModal(false)}
        selectedTags={state.categoryTags}
        onTagsChange={handleTagsChange}
      />

      <FolderSelectionModal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        onSelect={handleFolderSelect}
        selectedFolder={state.destinationFolderName}
      />
    </div>
  );
}
