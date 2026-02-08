import { Target, RefreshCw } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import { WizardPersonaCard } from '@/components/course/WizardPersonaCard';
import Button from '@/components/ui/Button';

interface WizardStep4AudienceProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep4Audience({ context, send }: WizardStep4AudienceProps) {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header — inline icon + title + regenerate */}
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

      {/* Section label */}
      <h3 className="text-sm font-semibold text-primary mb-3">
        AI Generated Audiences
      </h3>

      {/* 3-column audience grid */}
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
          />
        ))}
      </div>

      {/* Selection hint */}
      {context.audiencePersonas.length > 0 && (
        <p className="text-sm text-muted text-center">
          Select at least one audience. These profiles will shape the difficulty and focus of your content.
          <span className="block text-xs mt-1">
            {context.selectedAudienceIds.length} of {context.audiencePersonas.length} audience{context.audiencePersonas.length === 1 ? '' : 's'} selected
          </span>
        </p>
      )}
    </div>
  );
}
