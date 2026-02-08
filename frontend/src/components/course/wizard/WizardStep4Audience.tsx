import { Target, RefreshCw } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import { WizardPersonaCard } from '@/components/course/WizardPersonaCard';

interface WizardStep4AudienceProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep4Audience({ context, send }: WizardStep4AudienceProps) {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Hero */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
          <Target className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-xl font-semibold text-primary mb-2">
          Define Your Target Audience
        </h2>
        <p className="text-sm text-secondary max-w-lg">
          AI has generated audience personas based on your course and selected experts.
          Select the learner profiles you want to target.
        </p>
      </div>

      {/* Regenerate button */}
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => send({ type: 'REGENERATE' })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-secondary hover:text-primary hover:bg-hover rounded-md transition-colors min-h-[32px]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Regenerate
        </button>
      </div>

      {/* Audience cards */}
      <div className="space-y-3">
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
          />
        ))}
      </div>

      {/* Selection count */}
      {context.audiencePersonas.length > 0 && (
        <p className="text-xs text-muted text-center mt-4">
          {context.selectedAudienceIds.length} of {context.audiencePersonas.length} audience{context.audiencePersonas.length === 1 ? '' : 's'} selected
        </p>
      )}
    </div>
  );
}
