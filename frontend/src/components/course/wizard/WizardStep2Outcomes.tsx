'use client';

import { Target, Pencil } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';

interface WizardStep2OutcomesProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep2Outcomes({ context, send }: WizardStep2OutcomesProps) {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
          <Target className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold text-primary mb-2">
          Learning Outcomes
        </h2>
        <p className="text-sm text-secondary max-w-lg">
          AI has generated outcomes and an improved title. Edit them to match your vision.
        </p>
      </div>

      {/* Suggested title */}
      {context.suggestedTitle && (
        <div className="mb-6">
          <label htmlFor="suggestedTitle" className="flex items-center gap-1.5 text-sm font-semibold text-primary mb-2">
            <Pencil className="w-3.5 h-3.5" />
            Suggested Title
          </label>
          <input
            id="suggestedTitle"
            type="text"
            value={context.suggestedTitle}
            onChange={(e) => send({ type: 'SET_SUGGESTED_TITLE', value: e.target.value })}
            className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-xs text-muted mt-1.5">
            AI improved your title. Edit it or keep the original.
          </p>
        </div>
      )}

      {/* Editable outcomes */}
      <div>
        <label htmlFor="outcomes" className="block text-sm font-semibold text-primary mb-2">
          What will learners be able to do?
        </label>
        <textarea
          id="outcomes"
          value={context.outcomes}
          onChange={(e) => send({ type: 'SET_OUTCOMES', value: e.target.value })}
          placeholder="Describe what learners should achieve after completing this course..."
          rows={8}
          className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />
        <p className="text-xs text-muted mt-2">
          These outcomes shape the entire course structure. Be as specific as you like.
        </p>
      </div>
    </div>
  );
}
