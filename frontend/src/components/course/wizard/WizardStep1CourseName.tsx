import { useState } from 'react';
import { Sparkles, BookOpen, Globe, Lock } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import { KnowledgeSelectionModal } from '@/components/course/KnowledgeSelectionModal';

interface WizardStep1CourseNameProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
  isGeneratingOutcomes: boolean;
}

export function WizardStep1CourseName({ context, send, isGeneratingOutcomes }: WizardStep1CourseNameProps) {
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const totalSelectedDocs = context.selectedTeamDocIds.length + context.selectedGlobalDocIds.length;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Hero */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
          <Sparkles className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-xl font-semibold text-primary mb-2">
          What would you like to teach?
        </h2>
        <p className="text-sm text-secondary max-w-lg">
          Enter your course topic. AI will guide you through refining the title,
          selecting experts, defining your audience, and choosing a tone.
        </p>
      </div>

      {/* Course Name */}
      <div className="mb-5">
        <label htmlFor="courseName" className="block text-sm font-semibold text-primary mb-1.5">
          Course Topic
        </label>
        <input
          id="courseName"
          type="text"
          value={context.courseName}
          onChange={(e) => send({ type: 'SET_COURSE_NAME', value: e.target.value })}
          placeholder="e.g., Introduction to Machine Learning, Leadership Skills for Managers"
          className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Desired Outcomes */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="outcomes" className="block text-sm font-semibold text-primary">
            Desired Course Outcomes
            <span className="text-muted font-normal ml-1">(optional)</span>
          </label>
          <button
            type="button"
            onClick={() => send({ type: 'GENERATE_OUTCOMES' })}
            disabled={!context.courseName.trim() || isGeneratingOutcomes}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[32px]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isGeneratingOutcomes ? 'Generating...' : 'Generate'}
          </button>
        </div>
        <textarea
          id="outcomes"
          value={context.desiredOutcomes}
          onChange={(e) => send({ type: 'SET_DESIRED_OUTCOMES', value: e.target.value })}
          placeholder="Describe what learners should be able to do after completing the course..."
          rows={3}
          className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Advanced Settings */}
      <div className="border rounded-lg">
        <div className="px-4 py-3 text-sm font-medium text-secondary">
          Advanced Settings
        </div>
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
            {/* Internal Knowledge */}
            <div>
              <label htmlFor="internalKnowledge" className="flex items-center gap-3 cursor-pointer select-none">
                <div className="relative">
                  <input
                    id="internalKnowledge"
                    type="checkbox"
                    checked={context.enableInternalKnowledge}
                    onChange={(e) =>
                      send({
                        type: 'SET_KNOWLEDGE_SETTINGS',
                        enableInternalKnowledge: e.target.checked,
                        selectedTeamDocIds: context.selectedTeamDocIds,
                        selectedGlobalDocIds: context.selectedGlobalDocIds,
                        enableWebResearch: context.enableWebResearch,
                        strictKnowledgeOnly: e.target.checked ? context.strictKnowledgeOnly : false,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-page border rounded-full peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-secondary" />
                  <span className="text-sm font-medium text-primary">Internal Knowledge</span>
                  <span className="text-xs text-muted">— ground content in your documents</span>
                </div>
              </label>

              {context.enableInternalKnowledge && (
                <div className="ml-12 mt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowKnowledgeModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-secondary bg-surface border rounded-lg hover:bg-hover transition-colors min-h-[32px]"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    {totalSelectedDocs > 0
                      ? `${totalSelectedDocs} source${totalSelectedDocs === 1 ? '' : 's'} selected`
                      : 'Select Knowledge Sources'}
                    {totalSelectedDocs > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
                        {totalSelectedDocs}
                      </span>
                    )}
                  </button>

                  {totalSelectedDocs > 0 && (
                    <label htmlFor="strictKnowledge" className="flex items-center gap-3 cursor-pointer select-none">
                      <div className="relative">
                        <input
                          id="strictKnowledge"
                          type="checkbox"
                          checked={context.strictKnowledgeOnly}
                          onChange={(e) =>
                            send({
                              type: 'SET_KNOWLEDGE_SETTINGS',
                              enableInternalKnowledge: context.enableInternalKnowledge,
                              selectedTeamDocIds: context.selectedTeamDocIds,
                              selectedGlobalDocIds: context.selectedGlobalDocIds,
                              enableWebResearch: context.enableWebResearch,
                              strictKnowledgeOnly: e.target.checked,
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-page border rounded-full peer-checked:bg-amber-600 peer-checked:border-amber-600 transition-colors" />
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-medium text-primary">Strict mode</span>
                        <span className="text-[10px] text-muted">— only use internal knowledge</span>
                      </div>
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* Web Research */}
            <label htmlFor="webResearch" className="flex items-center gap-3 cursor-pointer select-none">
              <div className="relative">
                <input
                  id="webResearch"
                  type="checkbox"
                  checked={context.enableWebResearch}
                  onChange={(e) =>
                    send({
                      type: 'SET_KNOWLEDGE_SETTINGS',
                      enableInternalKnowledge: context.enableInternalKnowledge,
                      selectedTeamDocIds: context.selectedTeamDocIds,
                      selectedGlobalDocIds: context.selectedGlobalDocIds,
                      enableWebResearch: e.target.checked,
                      strictKnowledgeOnly: context.strictKnowledgeOnly,
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-page border rounded-full peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-secondary" />
                <span className="text-sm font-medium text-primary">Web Research</span>
                <span className="text-xs text-muted">— enrich analysis with live web data</span>
              </div>
            </label>
          </div>
      </div>

      {/* Knowledge selection modal */}
      {showKnowledgeModal && (
        <KnowledgeSelectionModal
          selectedTeamDocIds={context.selectedTeamDocIds}
          selectedGlobalDocIds={context.selectedGlobalDocIds}
          onConfirm={(teamIds, globalIds) => {
            send({
              type: 'SET_KNOWLEDGE_SETTINGS',
              enableInternalKnowledge: context.enableInternalKnowledge,
              selectedTeamDocIds: teamIds,
              selectedGlobalDocIds: globalIds,
              enableWebResearch: context.enableWebResearch,
              strictKnowledgeOnly: context.strictKnowledgeOnly,
            });
            setShowKnowledgeModal(false);
          }}
          onClose={() => setShowKnowledgeModal(false)}
        />
      )}
    </div>
  );
}
