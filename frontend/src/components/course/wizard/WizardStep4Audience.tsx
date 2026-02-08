import { useState, useCallback } from 'react';
import { Target, RefreshCw, ChevronDown, ChevronRight, Plus, Check } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import type { AudiencePersona } from '@/gen/mirai/v1/course_wizard_pb';
import { WizardPersonaCard } from '@/components/course/WizardPersonaCard';
import { PersonaEditModal } from '@/components/course/wizard/PersonaEditModal';
import {
  audienceTemplateCategories,
  audienceTemplateToPersona,
  type AudienceTemplate,
} from '@/components/course/wizard/personaTemplates';
import Button from '@/components/ui/Button';

interface WizardStep4AudienceProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep4Audience({ context, send }: WizardStep4AudienceProps) {
  const [editingPersona, setEditingPersona] = useState<AudiencePersona | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const handleEdit = useCallback((id: string) => {
    const persona = context.audiencePersonas.find((p) => p.id === id);
    if (persona) setEditingPersona(persona);
  }, [context.audiencePersonas]);

  const handleSaveEdit = useCallback((persona: AudiencePersona) => {
    send({ type: 'UPDATE_AUDIENCE_PERSONA', persona });
  }, [send]);

  const handleToggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  const addedTemplateIds = new Set(context.audiencePersonas.map((p) => p.id));

  const handleAddTemplate = useCallback((template: AudienceTemplate) => {
    if (addedTemplateIds.has(template.id)) return;
    const persona = audienceTemplateToPersona(template) as unknown as AudiencePersona;
    send({ type: 'ADD_AUDIENCE_PERSONA', persona });
  }, [send, addedTemplateIds]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
            <Target className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary">
              Define Your Target Audience
            </h2>
            <p className="text-sm sm:text-base text-secondary">
              Select the learner profiles you want to target.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => send({ type: 'REGENERATE' })}
          className="self-start sm:self-auto gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Regenerate
        </Button>
      </div>

      {/* AI Generated Audiences */}
      <h3 className="text-sm font-semibold text-primary mb-3">
        AI Generated Audiences
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {context.audiencePersonas.map((persona) => (
          <WizardPersonaCard
            key={persona.id}
            id={persona.id}
            title={persona.name}
            subtitle={persona.role}
            description={persona.description}
            tags={persona.goals}
            selected={context.selectedAudienceIds.includes(persona.id)}
            onToggle={(id) => send({ type: 'TOGGLE_AUDIENCE', id })}
            onEdit={handleEdit}
          />
        ))}
      </div>

      {/* Template Library */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-semibold text-primary mb-3">
          Template Library
        </h3>
        <div className="space-y-2">
          {audienceTemplateCategories.map((category) => {
            const isExpanded = expandedCategories.has(category.id);
            const addedCount = category.templates.filter((t) => addedTemplateIds.has(t.id)).length;

            return (
              <div key={category.id} className="border rounded-lg">
                <button
                  type="button"
                  onClick={() => handleToggleCategory(category.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-primary hover:bg-hover rounded-lg transition-colors min-h-[44px]"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted shrink-0" />
                    )}
                    <span>{category.name}</span>
                    {addedCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
                        {addedCount} added
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted">{category.templates.length} templates</span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 flex flex-wrap gap-2">
                    {category.templates.map((template) => {
                      const isAdded = addedTemplateIds.has(template.id);
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleAddTemplate(template)}
                          disabled={isAdded}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors min-h-[36px] ${
                            isAdded
                              ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                              : 'bg-surface border-gray-200 dark:border-gray-700 text-secondary hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400'
                          }`}
                        >
                          {isAdded ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          {template.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selection hint */}
      {context.audiencePersonas.length > 0 && (
        <p className="text-sm text-muted text-center mt-6">
          Select at least one audience. These profiles will shape the difficulty and focus of your content.
          <span className="block text-xs mt-1">
            {context.selectedAudienceIds.length} of {context.audiencePersonas.length} audience{context.audiencePersonas.length === 1 ? '' : 's'} selected
          </span>
        </p>
      )}

      {/* Edit Modal */}
      <PersonaEditModal
        isOpen={!!editingPersona}
        onClose={() => setEditingPersona(null)}
        personaType="audience"
        persona={editingPersona}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
