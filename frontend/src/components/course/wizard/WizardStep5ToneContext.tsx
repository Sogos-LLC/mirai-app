import { MessageCircle, RefreshCw } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import { ToneOptionCard } from '@/components/course/ToneOptionCard';
import Button from '@/components/ui/Button';

interface WizardStep5ToneContextProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep5ToneContext({ context, send }: WizardStep5ToneContextProps) {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header — inline icon + title + regenerate */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
            <MessageCircle className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary">
              Choose Your Course Tone
            </h2>
            <p className="text-sm sm:text-base text-secondary">
              Select how you want your course content to sound and feel.
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

      {/* 3-column tone cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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

      <p className="text-sm text-muted text-center mb-8">
        The tone you select will influence the writing style, complexity, and detail level of your course content.
      </p>

      {/* Additional Context */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-primary mb-2">
          Additional Context
          <span className="text-muted font-normal text-sm ml-1">(optional)</span>
        </h3>
        <p className="text-sm text-secondary mb-4">
          Add any extra details to help guide the course outline.
        </p>
        <textarea
          id="additionalContext"
          value={context.additionalContext}
          onChange={(e) => send({ type: 'SET_ADDITIONAL_CONTEXT', value: e.target.value })}
          placeholder="Examples:&#10;&#8226; Focus more on practical examples than theory&#10;&#8226; Include a section on common mistakes to avoid&#10;&#8226; The course should be completable in under 2 hours&#10;&#8226; Prerequisite: Basic understanding of Python"
          rows={5}
          className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />
        <p className="text-sm text-muted mt-2">
          This information will be used to customize your course outline.
        </p>
      </div>
    </div>
  );
}
