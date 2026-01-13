'use client';

import React, { useState } from 'react';
import { Target, Check, RefreshCw, Edit2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import type { AudiencePersona } from '@/gen/mirai/v1/course_wizard_pb';
import WizardNavigation from '../WizardNavigation';
import PersonaEditModal from '../modals/PersonaEditModal';
import {
  personaTemplateCategories,
  templateToPersona,
  type PersonaTemplate,
} from '../constants/personaTemplates';

interface AudiencePersonasStepProps {
  personas: AudiencePersona[];
  selectedIds: string[];
  onTogglePersona: (id: string) => void;
  onEditPersona: (persona: AudiencePersona) => void;
  onAddTemplatePersona: (persona: AudiencePersona) => void;
  onNext: () => void;
  onBack: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function AudiencePersonasStep({
  personas,
  selectedIds,
  onTogglePersona,
  onEditPersona,
  onAddTemplatePersona,
  onNext,
  onBack,
  onRegenerate,
  onCancel,
  isLoading = false,
}: AudiencePersonasStepProps) {
  const [editingPersona, setEditingPersona] = useState<AudiencePersona | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const canProceed = selectedIds.length > 0;

  const handleEditClick = (persona: AudiencePersona, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPersona(persona);
  };

  const handleSaveEdit = (updatedPersona: AudiencePersona) => {
    onEditPersona(updatedPersona);
    setEditingPersona(null);
  };

  const handleCloseModal = () => {
    setEditingPersona(null);
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const handleAddTemplate = (template: PersonaTemplate) => {
    const persona = templateToPersona(template);
    onAddTemplatePersona(persona as AudiencePersona);
  };

  const isTemplateAdded = (templateId: string) => {
    return personas.some((p) => p.id === templateId);
  };

  return (
    <>
      <Card>
        <CardContent className="py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Target className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-primary">
                    Define Your Target Audience
                  </h2>
                  <p className="text-sm sm:text-base text-secondary">
                    Select who this course is for. This helps tailor content to their needs.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                disabled={isLoading}
                className="self-start sm:self-auto"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
            </div>

            {/* AI Generated Target Audience */}
            <h3 className="text-sm font-semibold text-primary mb-3">
              AI Generated Target Audience
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {personas.map((persona) => {
                const isSelected = selectedIds.includes(persona.id);

                return (
                  <div
                    key={persona.id}
                    onClick={() => onTogglePersona(persona.id)}
                    className={`
                      p-4 rounded-lg border-2 cursor-pointer transition-all
                      ${isSelected
                        ? 'border-primary-500 bg-primary-50/50'
                        : 'border-transparent bg-surface hover:border-gray-300'
                      }
                    `}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-primary">{persona.name}</h3>
                        <p className="text-sm text-muted">{persona.role}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleEditClick(persona, e)}
                          className="p-2 rounded hover:bg-hover min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <Edit2 className="w-4 h-4 text-muted" />
                        </button>
                        <div
                          className={`
                            w-5 h-5 rounded-full border-2 flex items-center justify-center
                            ${isSelected
                              ? 'bg-primary-600 border-primary-600'
                              : 'border-gray-300'
                            }
                          `}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-secondary mb-3 line-clamp-2">
                      {persona.description}
                    </p>
                    {persona.goals && persona.goals.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted">Goals:</p>
                        <ul className="text-xs text-secondary space-y-0.5">
                          {persona.goals.slice(0, 2).map((goal, i) => (
                            <li key={i} className="line-clamp-1">• {goal}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-sm text-muted text-center mb-6">
              Select at least one audience. Content will be tailored to their experience level and goals.
            </p>

            {/* Quick Add Templates Section */}
            <div className="p-4 bg-surface-elevated border rounded-lg">
              <p className="text-sm text-muted mb-3">
                Want to add more audiences? Quick add from our template library
              </p>
              <div className="space-y-2">
                {personaTemplateCategories.map((category) => {
                  const isExpanded = expandedCategories.has(category.id);
                  const addedCount = category.templates.filter((t) => isTemplateAdded(t.id)).length;

                  return (
                    <div key={category.id}>
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className="w-full flex items-center justify-between p-2 rounded hover:bg-hover transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted" />
                          )}
                          <span className="text-sm font-medium text-primary">{category.name}</span>
                          {addedCount > 0 && (
                            <span className="text-xs text-muted">
                              ({addedCount} added)
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted">
                          {category.templates.length} templates
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="flex flex-wrap gap-2 pl-6 pt-2 pb-1">
                          {category.templates.map((template) => {
                            const added = isTemplateAdded(template.id);
                            return (
                              <button
                                key={template.id}
                                onClick={() => !added && handleAddTemplate(template)}
                                disabled={added}
                                className={`
                                  flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full
                                  transition-colors
                                  ${added
                                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 cursor-default'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-dark-300 dark:text-dark-text dark:hover:bg-dark-400'
                                  }
                                `}
                                title={template.description}
                              >
                                {added ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Plus className="w-3 h-3" />
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
          </div>

          <WizardNavigation
            onBack={onBack}
            onNext={onNext}
            onCancel={onCancel}
            canGoBack={true}
            canGoNext={canProceed}
            isLoading={isLoading}
            nextLabel="Generate Tones"
          />
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <PersonaEditModal
        isOpen={!!editingPersona}
        onClose={handleCloseModal}
        personaType="audience"
        persona={editingPersona}
        onSave={handleSaveEdit}
      />
    </>
  );
}
