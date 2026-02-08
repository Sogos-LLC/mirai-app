'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, X, Plus } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { SMEPersona, AudiencePersona } from '@/gen/mirai/v1/course_wizard_pb';

interface BasePersonaEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
}

interface SMEPersonaEditModalProps extends BasePersonaEditModalProps {
  personaType: 'sme';
  persona: SMEPersona | null;
  onSave: (persona: SMEPersona) => void;
}

interface AudiencePersonaEditModalProps extends BasePersonaEditModalProps {
  personaType: 'audience';
  persona: AudiencePersona | null;
  onSave: (persona: AudiencePersona) => void;
}

type PersonaEditModalProps = SMEPersonaEditModalProps | AudiencePersonaEditModalProps;

interface SMEEditForm {
  jobTitle: string;
  description: string;
  voice: string;
  skills: string[];
}

interface AudienceEditForm {
  name: string;
  role: string;
  description: string;
  goals: string[];
}

export function PersonaEditModal(props: PersonaEditModalProps) {
  const { isOpen, onClose, isLoading = false, personaType, persona } = props;

  const [smeForm, setSMEForm] = useState<SMEEditForm>({
    jobTitle: '',
    description: '',
    voice: '',
    skills: [],
  });

  const [audienceForm, setAudienceForm] = useState<AudienceEditForm>({
    name: '',
    role: '',
    description: '',
    goals: [],
  });

  const [newSkill, setNewSkill] = useState('');
  const [newGoal, setNewGoal] = useState('');

  useEffect(() => {
    if (personaType === 'sme' && persona) {
      const smePersona = persona as SMEPersona;
      setSMEForm({
        jobTitle: smePersona.jobTitle || '',
        description: smePersona.description || '',
        voice: smePersona.voice || '',
        skills: [...(smePersona.skills || [])],
      });
    } else if (personaType === 'audience' && persona) {
      const audiencePersona = persona as AudiencePersona;
      setAudienceForm({
        name: audiencePersona.name || '',
        role: audiencePersona.role || '',
        description: audiencePersona.description || '',
        goals: [...(audiencePersona.goals || [])],
      });
    }
  }, [persona, personaType, isOpen]);

  const handleSave = () => {
    if (!persona) return;

    if (personaType === 'sme') {
      const smeProps = props as SMEPersonaEditModalProps;
      smeProps.onSave({
        ...persona,
        jobTitle: smeForm.jobTitle,
        description: smeForm.description,
        voice: smeForm.voice,
        skills: smeForm.skills,
      } as SMEPersona);
    } else {
      const audienceProps = props as AudiencePersonaEditModalProps;
      audienceProps.onSave({
        ...persona,
        name: audienceForm.name,
        role: audienceForm.role,
        description: audienceForm.description,
        goals: audienceForm.goals,
      } as AudiencePersona);
    }
    onClose();
  };

  const handleAddSkill = () => {
    if (newSkill.trim()) {
      setSMEForm((prev) => ({ ...prev, skills: [...prev.skills, newSkill.trim()] }));
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (index: number) => {
    setSMEForm((prev) => ({ ...prev, skills: prev.skills.filter((_, i) => i !== index) }));
  };

  const handleAddGoal = () => {
    if (newGoal.trim()) {
      setAudienceForm((prev) => ({ ...prev, goals: [...prev.goals, newGoal.trim()] }));
      setNewGoal('');
    }
  };

  const handleRemoveGoal = (index: number) => {
    setAudienceForm((prev) => ({ ...prev, goals: prev.goals.filter((_, i) => i !== index) }));
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  };

  const isValid =
    personaType === 'sme'
      ? smeForm.jobTitle.trim() && smeForm.description.trim()
      : audienceForm.name.trim() && audienceForm.role.trim();

  const title = personaType === 'sme' ? 'Edit Expert' : 'Edit Audience';

  const footer = (
    <div className="flex justify-end gap-3">
      <Button variant="secondary" onClick={onClose} disabled={isLoading}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSave} disabled={isLoading || !isValid}>
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          'Save Changes'
        )}
      </Button>
    </div>
  );

  if (!persona) return null;

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      mobileHeight="full"
      footer={footer}
    >
      <div className="space-y-5">
        {personaType === 'sme' ? (
          <>
            <Input
              label="Job Title"
              value={smeForm.jobTitle}
              onChange={(e) => setSMEForm({ ...smeForm, jobTitle: e.target.value })}
              placeholder="e.g., Senior Software Engineer"
            />

            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">
                Description
              </label>
              <textarea
                value={smeForm.description}
                onChange={(e) => setSMEForm({ ...smeForm, description: e.target.value })}
                rows={3}
                placeholder="Describe this expert's background and expertise..."
                className="w-full px-4 py-3 text-sm border rounded-lg outline-none transition-all bg-page text-primary placeholder:text-muted focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">
                Voice / Teaching Style
              </label>
              <textarea
                value={smeForm.voice}
                onChange={(e) => setSMEForm({ ...smeForm, voice: e.target.value })}
                rows={2}
                placeholder="Describe how this expert communicates..."
                className="w-full px-4 py-3 text-sm border rounded-lg outline-none transition-all bg-page text-primary placeholder:text-muted focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">Skills</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {smeForm.skills.map((skill, index) => (
                  <span
                    key={index}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full"
                  >
                    {skill}
                    <button
                      onClick={() => handleRemoveSkill(index)}
                      className="p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, handleAddSkill)}
                  placeholder="Add a skill..."
                  className="flex-1"
                />
                <Button variant="secondary" size="sm" onClick={handleAddSkill} disabled={!newSkill.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <Input
              label="Name"
              value={audienceForm.name}
              onChange={(e) => setAudienceForm({ ...audienceForm, name: e.target.value })}
              placeholder="e.g., Junior Developer"
            />

            <Input
              label="Role"
              value={audienceForm.role}
              onChange={(e) => setAudienceForm({ ...audienceForm, role: e.target.value })}
              placeholder="e.g., Software Engineer with 0-2 years experience"
            />

            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">
                Description
              </label>
              <textarea
                value={audienceForm.description}
                onChange={(e) => setAudienceForm({ ...audienceForm, description: e.target.value })}
                rows={3}
                placeholder="Describe this audience's background and context..."
                className="w-full px-4 py-3 text-sm border rounded-lg outline-none transition-all bg-page text-primary placeholder:text-muted focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">Learning Goals</label>
              <div className="space-y-2 mb-2">
                {audienceForm.goals.map((goal, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 bg-surface-elevated border rounded-lg"
                  >
                    <span className="flex-1 text-sm text-secondary">{goal}</span>
                    <button
                      onClick={() => handleRemoveGoal(index)}
                      className="p-1 hover:bg-hover rounded"
                    >
                      <X className="w-4 h-4 text-muted" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newGoal}
                  onChange={(e) => setNewGoal(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, handleAddGoal)}
                  placeholder="Add a learning goal..."
                  className="flex-1"
                />
                <Button variant="secondary" size="sm" onClick={handleAddGoal} disabled={!newGoal.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
