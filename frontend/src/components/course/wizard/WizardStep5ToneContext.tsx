import { MessageCircle, RefreshCw } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import { ToneOptionCard } from '@/components/course/ToneOptionCard';

interface WizardStep5ToneContextProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep5ToneContext({ context, send }: WizardStep5ToneContextProps) {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Hero */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
          <MessageCircle className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-xl font-semibold text-primary mb-2">
          Choose Tone & Add Context
        </h2>
        <p className="text-sm text-secondary max-w-lg">
          Select a tone and detail level for your course, and add any additional
          context or special instructions for the AI.
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

      {/* Tone option cards */}
      <div className="space-y-3 mb-6">
        {context.toneOptions.map((tone) => (
          <ToneOptionCard
            key={tone.id}
            id={tone.id}
            name={tone.name}
            description={tone.description}
            levelOfDetail={tone.levelOfDetail}
            selected={context.selectedToneId === tone.id}
            onSelect={(id) => send({ type: 'SET_TONE', id })}
          />
        ))}
      </div>

      {/* Additional Context */}
      <div>
        <label htmlFor="additionalContext" className="block text-sm font-semibold text-primary mb-1.5">
          Additional Context
          <span className="text-muted font-normal ml-1">(optional)</span>
        </label>
        <textarea
          id="additionalContext"
          value={context.additionalContext}
          onChange={(e) => send({ type: 'SET_ADDITIONAL_CONTEXT', value: e.target.value })}
          placeholder="Any specific requirements, constraints, or special instructions for the AI course builder..."
          rows={4}
          className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />
      </div>
    </div>
  );
}
