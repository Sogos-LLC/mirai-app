'use client';

import { Sparkles } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';

interface WizardStep1TitleProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep1Title({ context, send }: WizardStep1TitleProps) {
  return (
    <div className="max-w-xl mx-auto">
      {/* Hero */}
      <div className="flex flex-col items-center text-center mb-10">
        <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-5">
          <Sparkles className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold text-primary mb-2">
          What do you want to teach?
        </h2>
        <p className="text-sm text-secondary max-w-md">
          Enter a topic, skill, or subject — AI will build a complete course for you.
        </p>
      </div>

      {/* Title input */}
      <div>
        <input
          id="courseTitle"
          type="text"
          value={context.courseTitle}
          onChange={(e) => send({ type: 'SET_COURSE_TITLE', value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && context.courseTitle.trim()) {
              send({ type: 'NEXT' });
            }
          }}
          placeholder="e.g., Introduction to Machine Learning, Leadership for New Managers"
          autoFocus
          className="w-full px-5 py-4 bg-page border rounded-xl text-primary text-lg min-h-[56px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-placeholder"
        />
        <p className="text-xs text-muted mt-2 text-center">
          Press Enter or click Next to continue
        </p>
      </div>
    </div>
  );
}
