import { Users, RefreshCw } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import { WizardPersonaCard } from '@/components/course/WizardPersonaCard';

interface WizardStep3PersonasProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep3Personas({ context, send }: WizardStep3PersonasProps) {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Hero */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
          <Users className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-xl font-semibold text-primary mb-2">
          Select Subject Matter Experts
        </h2>
        <p className="text-sm text-secondary max-w-lg">
          AI has generated expert personas to guide your course content.
          Select the ones that best align with your course goals.
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

      {/* Persona cards */}
      <div className="space-y-3">
        {context.smePersonas.map((persona) => (
          <WizardPersonaCard
            key={persona.id}
            id={persona.id}
            title={persona.jobTitle}
            subtitle={persona.voice}
            description={persona.description}
            tags={persona.skills}
            selected={context.selectedSmeIds.includes(persona.id)}
            onToggle={(id) => send({ type: 'TOGGLE_SME', id })}
          />
        ))}
      </div>

      {/* Selection count */}
      {context.smePersonas.length > 0 && (
        <p className="text-xs text-muted text-center mt-4">
          {context.selectedSmeIds.length} of {context.smePersonas.length} expert{context.smePersonas.length === 1 ? '' : 's'} selected
        </p>
      )}
    </div>
  );
}
