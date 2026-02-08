import { Users, RefreshCw } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import { WizardPersonaCard } from '@/components/course/WizardPersonaCard';
import Button from '@/components/ui/Button';

interface WizardStep3PersonasProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep3Personas({ context, send }: WizardStep3PersonasProps) {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header — inline icon + title + regenerate */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary">
              Select Your Subject Matter Experts
            </h2>
            <p className="text-sm sm:text-base text-secondary">
              Choose the expert personas that will guide your course content.
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

      {/* Section label */}
      <h3 className="text-sm font-semibold text-primary mb-3">
        AI Generated Personas
      </h3>

      {/* 3-column persona grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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

      {/* Selection hint */}
      {context.smePersonas.length > 0 && (
        <p className="text-sm text-muted text-center">
          Select at least one persona. These experts will influence the tone and depth of your course content.
          <span className="block text-xs mt-1">
            {context.selectedSmeIds.length} of {context.smePersonas.length} expert{context.smePersonas.length === 1 ? '' : 's'} selected
          </span>
        </p>
      )}
    </div>
  );
}
