'use client';

import React, { useState } from 'react';
import { Users, Check, RefreshCw, Edit2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { SMEPersona } from '@/gen/mirai/v1/course_wizard_pb';
import WizardNavigation from '../WizardNavigation';

interface SMEPersonasStepProps {
  personas: SMEPersona[];
  selectedIds: string[];
  onTogglePersona: (id: string) => void;
  onEditPersona: (persona: SMEPersona) => void;
  onNext: () => void;
  onBack: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function SMEPersonasStep({
  personas,
  selectedIds,
  onTogglePersona,
  onEditPersona,
  onNext,
  onBack,
  onRegenerate,
  onCancel,
  isLoading = false,
}: SMEPersonasStepProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    jobTitle: string;
    description: string;
    voice: string;
  }>({ jobTitle: '', description: '', voice: '' });

  const canProceed = selectedIds.length > 0;

  const handleStartEdit = (persona: SMEPersona) => {
    setEditingId(persona.id);
    setEditForm({
      jobTitle: persona.jobTitle,
      description: persona.description,
      voice: persona.voice,
    });
  };

  const handleSaveEdit = (persona: SMEPersona) => {
    onEditPersona({
      ...persona,
      jobTitle: editForm.jobTitle,
      description: editForm.description,
      voice: editForm.voice,
    });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  return (
    <Card>
      <CardContent className="py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-primary">
                  Select Your Instructors
                </h2>
                <p className="text-secondary">
                  Choose the expert personas that will guide your course content.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {personas.map((persona) => {
              const isSelected = selectedIds.includes(persona.id);
              const isEditing = editingId === persona.id;

              if (isEditing) {
                return (
                  <div
                    key={persona.id}
                    className="p-4 rounded-lg border-2 border-primary-500 bg-surface"
                  >
                    <div className="space-y-3">
                      <Input
                        label="Job Title"
                        value={editForm.jobTitle}
                        onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })}
                      />
                      <div>
                        <label className="block text-sm font-medium text-primary mb-1">
                          Description
                        </label>
                        <textarea
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-2 text-sm border rounded-lg outline-none
                            bg-white dark:bg-dark-400
                            border-gray-300 dark:border-dark-border-input
                            text-gray-900 dark:text-dark-text
                            focus:ring-2 focus:ring-primary-500 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-primary mb-1">
                          Voice/Style
                        </label>
                        <textarea
                          value={editForm.voice}
                          onChange={(e) => setEditForm({ ...editForm, voice: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-2 text-sm border rounded-lg outline-none
                            bg-white dark:bg-dark-400
                            border-gray-300 dark:border-dark-border-input
                            text-gray-900 dark:text-dark-text
                            focus:ring-2 focus:ring-primary-500 resize-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleSaveEdit(persona)}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelEdit}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }

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
                    <h3 className="font-semibold text-primary">{persona.jobTitle}</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(persona);
                        }}
                        className="p-1 rounded hover:bg-hover"
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
                  <p className="text-sm text-secondary mb-2 line-clamp-2">
                    {persona.description}
                  </p>
                  {persona.skills && persona.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {persona.skills.slice(0, 3).map((skill, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-xs bg-surface border rounded-full text-muted"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted italic line-clamp-1">
                    Voice: {persona.voice}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="text-sm text-muted text-center mb-4">
            Select at least one persona. These experts will influence the tone and depth of your course content.
          </p>
        </div>

        <WizardNavigation
          onBack={onBack}
          onNext={onNext}
          onCancel={onCancel}
          canGoBack={true}
          canGoNext={canProceed}
          isLoading={isLoading}
          nextLabel="Generate Audiences"
        />
      </CardContent>
    </Card>
  );
}
