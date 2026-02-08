import { Sparkles } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';

interface WizardStep2TitleDescriptionProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep2TitleDescription({ context, send }: WizardStep2TitleDescriptionProps) {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Hero */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
          <Sparkles className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-xl font-semibold text-primary mb-2">
          Review Your Course Title
        </h2>
        <p className="text-sm text-secondary max-w-lg">
          AI has suggested an improved title and description based on your topic.
          Feel free to edit them to better match your vision.
        </p>
      </div>

      {/* Original topic (read-only summary) */}
      <div className="mb-5 px-4 py-3 bg-surface-elevated rounded-lg border border-subtle">
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
          Original Topic
        </p>
        <p className="text-sm text-primary">{context.courseName}</p>
        {context.desiredOutcomes && (
          <>
            <p className="text-xs font-medium text-muted uppercase tracking-wide mt-3 mb-1">
              Desired Outcomes
            </p>
            <p className="text-sm text-secondary whitespace-pre-line">{context.desiredOutcomes}</p>
          </>
        )}
      </div>

      {/* Course Title */}
      <div className="mb-5">
        <label htmlFor="improvedTitle" className="block text-sm font-semibold text-primary mb-1.5">
          Course Title
        </label>
        <input
          id="improvedTitle"
          type="text"
          value={context.improvedTitle}
          onChange={(e) => send({ type: 'SET_IMPROVED_TITLE', value: e.target.value })}
          placeholder="Course title..."
          className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Description */}
      <div className="mb-5">
        <label htmlFor="description" className="block text-sm font-semibold text-primary mb-1.5">
          Course Description
        </label>
        <textarea
          id="description"
          value={context.description}
          onChange={(e) => send({ type: 'SET_DESCRIPTION', value: e.target.value })}
          placeholder="A brief description of what the course covers..."
          rows={5}
          className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />
      </div>
    </div>
  );
}
